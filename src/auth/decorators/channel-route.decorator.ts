import { SetMetadata } from '@nestjs/common';

/** Restricts a route to the ecommerce service credential. */
export const CHANNEL_ROUTE = 'channelRoute';
export const ChannelRoute = () => SetMetadata(CHANNEL_ROUTE, true);
