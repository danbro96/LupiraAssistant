import { pure } from '@danbro96/lupira-config-eslint';

// Purity by construction: production modules may import nothing but each other — no dependencies, no
// generated DTO types, no platform APIs.
export default pure({ element: 'domain' });
