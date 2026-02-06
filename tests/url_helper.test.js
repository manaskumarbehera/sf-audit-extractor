import { normalizeApiBase } from '../url_helper.js';

describe('normalizeApiBase', () => {
    const cases = [
        { input: 'https://org.lightning.force.com', expected: 'https://org.my.salesforce.com' },
        { input: 'https://org--sb.sandbox.lightning.force.com', expected: 'https://org--sb.sandbox.my.salesforce.com' },
        { input: 'https://org.develop.lightning.force.com', expected: 'https://org.develop.my.salesforce.com' },
        { input: 'https://org.scratch.lightning.force.com', expected: 'https://org.scratch.my.salesforce.com' },
        { input: 'https://org.visual.force.com', expected: 'https://org.my.salesforce.com' },
        { input: 'https://org.vf.force.com', expected: 'https://org.my.salesforce.com' },
        { input: 'https://org.force.com', expected: 'https://org.salesforce.com' },
        { input: 'https://org.salesforce-setup.com', expected: 'https://org.my.salesforce.com' },
        { input: 'https://org.my.salesforce-setup.com', expected: 'https://org.my.salesforce.com' },
        { input: 'https://org.my.my.salesforce.com', expected: 'https://org.my.salesforce.com' },
        { input: 'https://org.my.salesforce.com', expected: 'https://org.my.salesforce.com' }
    ];

    test.each(cases)('normalizes %s', ({ input, expected }) => {
        expect(normalizeApiBase(input)).toBe(expected);
    });
});

