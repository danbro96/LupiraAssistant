import { mobile } from '@danbro96/lupira-config-eslint';

export default mobile({ layers: [{ name: 'collector', pattern: 'src/collector/**', imports: ['data', 'domain'], importedBy: ['state', 'ui'] }] });
