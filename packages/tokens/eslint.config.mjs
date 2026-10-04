import { pure } from '@danbro96/lupira-config-eslint';

// Purity by construction: token modules may import nothing but each other and the platform's token core —
// no generated DTO types, no platform APIs. That is what keeps this package consumable by both a web
// theme and a native one.
export default pure({ element: 'tokens', allowModules: ['@danbro96/lupira-tokens-core'] });
