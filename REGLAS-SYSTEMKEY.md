roles.systemKey varchar NULL

# Valores reservados:

TENANT_ADMIN
SYSTEM

# Reglas:

TENANT_ADMIN es tenant-owned.
Existe exactamente uno por tenant.
No puede eliminarse, renombrarse ni perder permisos obligatorios.
SYSTEM no tiene permisos operativos y no puede iniciar sesión.
Los roles personalizados no usan systemKey.
El master impersonado evalúa permisos mediante el TENANT_ADMIN del tenant.
Las operaciones impersonadas guardan:
userID = SYSTEM.userID
impersonatedBy = masterUserId
