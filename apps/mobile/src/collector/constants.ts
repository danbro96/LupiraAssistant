import { lightColors } from '@lupira/assistant-tokens/color';

export const LOCATION_TASK = 'lupira.assistant.location.collect';

export const FGS_NOTIFICATION_TITLE = 'Lupira Assistant';
export const FGS_NOTIFICATION_BODY = 'Recording your location';
/** Android tints the foreground-service notification itself, so this can't read the theme — but it
 *  is still the brand colour, and the light value is the one that reads on notification chrome. */
export const FGS_NOTIFICATION_COLOR = lightColors.primary;
