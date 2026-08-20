import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Tenant, TenantStatus } from './entities/tenant.entity';
import { AuditEvent } from './entities/audit-event.entity';
import { MasterUser } from './entities/master-user.entity';
import { LoginMasterDto } from './dto/login-master.dto';

export async function loginMaster(
  masterUsers: Repository<MasterUser>,
  jwt: JwtService,
  dto: LoginMasterDto,
) {
  const masterUser = await masterUsers.findOne({
    where: { email: dto.email },
  });
  if (!masterUser)
    throw new UnauthorizedException('Invalid master credentials');

  const isMatch = await bcrypt.compare(dto.password, masterUser.password);
  if (!isMatch) throw new UnauthorizedException('Invalid master credentials');

  const accessToken = await jwt.signAsync({
    type: 'master',
    masterUserId: masterUser.masterUserID,
    role: masterUser.role,
    sessionVersion: masterUser.sessionVersion,
  });

  return {
    masterUser: {
      masterUserID: masterUser.masterUserID,
      email: masterUser.email,
      role: masterUser.role,
    },
    accessToken,
  };
}

export async function impersonate(
  tenants: Repository<Tenant>,
  audit: Repository<AuditEvent>,
  jwt: JwtService,
  tenantID: string,
  masterUserID: string,
  reason?: string,
) {
  const tenant = await tenants.findOne({
    where: { tenantID, status: TenantStatus.ACTIVE },
  });
  if (!tenant) throw new NotFoundException('Tenant not found or inactive');
  await audit.save(
    audit.create({
      tenantID,
      masterUserID,
      action: 'IMPERSONATE',
      endpoint: 'master/impersonate',
      result: 'ISSUED',
      reason: reason ?? 'N/A',
    }),
  );
  return jwt.signAsync({
    type: 'master',
    masterUserId: masterUserID,
    role: 'SUPPORT',
    sessionVersion: 1,
    impersonatingTenantId: tenantID,
    impersonatingTimeZone: tenant.timeZone ?? 'America/Santiago',
    impersonatedBy: masterUserID,
  });
}
