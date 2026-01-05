import { createLogger } from '@slithermoney/shared';
import { config } from '../config';

export const logger = createLogger({
  serviceName: config.SERVICE_NAME,
  level: config.LOG_LEVEL,
});
