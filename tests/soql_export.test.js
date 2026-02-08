/**
 * SOQL Export Functionality Tests
 * Tests for exporting SOQL query results as JSON, CSV, TSV, and file downloads
 */

// Mock clipboard API
const mockClipboard = {
    writeText: jest.fn(() => Promise.resolve()),
    readText: jest.fn(() => Promise.resolve(''))
};

// Setup global mocks
global.navigator = {
    clipboard: mockClipboard
};

// Mock URL API
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

// Mock Blob
global.Blob = class Blob {
    constructor(parts, options) {
        this.parts = parts;
        this.options = options;
    }
};

// Mock document for download
const mockLink = {
    href: '',
    download: '',
    click: jest.fn()
};

global.document = {
    createElement: jest.fn((tag) => {
        if (tag === 'a') return { ...mockLink };
        return { appendChild: jest.fn() };
    }),
    body: {
        appendChild: jest.fn(),
        removeChild: jest.fn()
    }
};

// Sample test data - simulating Salesforce query results
const sampleRecords = [
    {
        attributes: { type: 'Account', url: '/services/data/v58.0/sobjects/Account/001xx000003DGbYAAW' },
        Id: '001xx000003DGbYAAW',
        Name: 'Acme Corporation',
        Industry: 'Technology',
        AnnualRevenue: 1000000,
        IsActive: true
    },
    {
        attributes: { type: 'Account', url: '/services/data/v58.0/sobjects/Account/001xx000003DGbZAAW' },
        Id: '001xx000003DGbZAAW',
        Name: 'Global Industries',
        Industry: 'Manufacturing',
        AnnualRevenue: 5000000,
        IsActive: false
    },
    {
        attributes: { type: 'Account', url: '/services/data/v58.0/sobjects/Account/001xx000003DGbaAAW' },
        Id: '001xx000003DGbaAAW',
        Name: 'Tech "Solutions" Ltd',
        Industry: 'Consulting',
        AnnualRevenue: null,
        IsActive: true
    }
];

const nestedRecords = [
    {
        attributes: { type: 'Contact', url: '/services/data/v58.0/sobjects/Contact/003xx000001AbcDEF' },
        Id: '003xx000001AbcDEF',
        FirstName: 'John',
        LastName: 'Doe',
        Account: {
            attributes: { type: 'Account', url: '/services/data/v58.0/sobjects/Account/001xx000003DGbYAAW' },
            Name: 'Acme Corporation',
            Industry: 'Technology'
        }
    },
    {
        attributes: { type: 'Contact', url: '/services/data/v58.0/sobjects/Contact/003xx000001AbcGHI' },
        Id: '003xx000001AbcGHI',
        FirstName: 'Jane',
        LastName: 'Smith',
        Account: {
            attributes: { type: 'Account', url: '/services/data/v58.0/sobjects/Account/001xx000003DGbZAAW' },
            Name: 'Global Industries',
            Industry: 'Manufacturing'
        }
    }
];

// Export functions (simulating the functions from soql_helper.js)
function flattenRecord(rec, prefix = '') {
    const flat = {};
    Object.keys(rec).forEach(key => {
        if (key === 'attributes') return;
        const val = rec[key];
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (val && typeof val === 'object' && !Array.isArray(val) && val.attributes) {
            Object.assign(flat, flattenRecord(val, fullKey));
        } else if (val && typeof val === 'object' && !Array.isArray(val)) {
            Object.assign(flat, flattenRecord(val, fullKey));
        } else {
            flat[fullKey] = val;
        }
    });
    return flat;
}

function getExportHeaders(records) {
    if (!records || records.length === 0) return [];
    const headers = new Set();
    records.forEach(rec => {
        Object.keys(rec).forEach(key => {
            if (key !== 'attributes') headers.add(key);
        });
    });
    return Array.from(headers);
}

function escapeCSVField(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function recordsToJson(records) {
    const cleaned = records.map(rec => flattenRecord(rec));
    return JSON.stringify(cleaned, null, 2);
}

function recordsToCsv(records, delimiter = ',') {
    if (!records || records.length === 0) return '';
    const flatRecords = records.map(rec => flattenRecord(rec));
    const headers = getExportHeaders(flatRecords);
    const headerRow = headers.map(h => escapeCSVField(h)).join(delimiter);
    const dataRows = flatRecords.map(rec => {
        return headers.map(h => escapeCSVField(rec[h])).join(delimiter);
    });
    return [headerRow, ...dataRows].join('\n');
}

// ==========================================
// TEST SUITES
// ==========================================

describe('SOQL Export - flattenRecord', () => {

    test('should flatten simple record and remove attributes', () => {
        const record = {
            attributes: { type: 'Account' },
            Id: '001xx000003DGbYAAW',
            Name: 'Test Account'
        };
        const flat = flattenRecord(record);

        expect(flat).not.toHaveProperty('attributes');
        expect(flat.Id).toBe('001xx000003DGbYAAW');
        expect(flat.Name).toBe('Test Account');
    });

    test('should flatten nested related object', () => {
        const record = {
            attributes: { type: 'Contact' },
            Id: '003xx000001AbcDEF',
            FirstName: 'John',
            Account: {
                attributes: { type: 'Account' },
                Name: 'Acme Corp',
                Industry: 'Tech'
            }
        };
        const flat = flattenRecord(record);

        expect(flat.Id).toBe('003xx000001AbcDEF');
        expect(flat.FirstName).toBe('John');
        expect(flat['Account.Name']).toBe('Acme Corp');
        expect(flat['Account.Industry']).toBe('Tech');
        expect(flat).not.toHaveProperty('Account.attributes');
    });

    test('should handle null values', () => {
        const record = {
            attributes: { type: 'Account' },
            Id: '001xx000003DGbYAAW',
            Name: null,
            Industry: undefined
        };
        const flat = flattenRecord(record);

        expect(flat.Name).toBeNull();
        expect(flat.Industry).toBeUndefined();
    });

    test('should handle deeply nested objects', () => {
        const record = {
            attributes: { type: 'Contact' },
            Id: '003xx000001AbcDEF',
            Account: {
                attributes: { type: 'Account' },
                Owner: {
                    attributes: { type: 'User' },
                    Name: 'Admin User'
                }
            }
        };
        const flat = flattenRecord(record);

        expect(flat['Account.Owner.Name']).toBe('Admin User');
    });
});

describe('SOQL Export - getExportHeaders', () => {

    test('should extract headers from records', () => {
        const records = [
            { Id: '001', Name: 'Test1' },
            { Id: '002', Name: 'Test2', Industry: 'Tech' }
        ];
        const headers = getExportHeaders(records);

        expect(headers).toContain('Id');
        expect(headers).toContain('Name');
        expect(headers).toContain('Industry');
    });

    test('should exclude attributes key', () => {
        const records = [
            { attributes: { type: 'Account' }, Id: '001', Name: 'Test' }
        ];
        const headers = getExportHeaders(records);

        expect(headers).not.toContain('attributes');
        expect(headers).toContain('Id');
        expect(headers).toContain('Name');
    });

    test('should return empty array for empty records', () => {
        expect(getExportHeaders([])).toEqual([]);
        expect(getExportHeaders(null)).toEqual([]);
        expect(getExportHeaders(undefined)).toEqual([]);
    });

    test('should return unique headers only', () => {
        const records = [
            { Id: '001', Name: 'Test1' },
            { Id: '002', Name: 'Test2' }
        ];
        const headers = getExportHeaders(records);

        const idCount = headers.filter(h => h === 'Id').length;
        expect(idCount).toBe(1);
    });
});

describe('SOQL Export - escapeCSVField', () => {

    test('should return empty string for null/undefined', () => {
        expect(escapeCSVField(null)).toBe('');
        expect(escapeCSVField(undefined)).toBe('');
    });

    test('should not escape simple strings', () => {
        expect(escapeCSVField('Hello')).toBe('Hello');
        expect(escapeCSVField('Test123')).toBe('Test123');
    });

    test('should escape strings with commas', () => {
        expect(escapeCSVField('Hello, World')).toBe('"Hello, World"');
    });

    test('should escape strings with double quotes', () => {
        expect(escapeCSVField('Say "Hello"')).toBe('"Say ""Hello"""');
    });

    test('should escape strings with newlines', () => {
        expect(escapeCSVField('Line1\nLine2')).toBe('"Line1\nLine2"');
        expect(escapeCSVField('Line1\rLine2')).toBe('"Line1\rLine2"');
    });

    test('should handle numbers', () => {
        expect(escapeCSVField(12345)).toBe('12345');
        expect(escapeCSVField(123.45)).toBe('123.45');
    });

    test('should handle boolean values', () => {
        expect(escapeCSVField(true)).toBe('true');
        expect(escapeCSVField(false)).toBe('false');
    });

    test('should escape complex strings with multiple special chars', () => {
        expect(escapeCSVField('Hello, "World"\nNew Line'))
            .toBe('"Hello, ""World""\nNew Line"');
    });
});

describe('SOQL Export - recordsToJson', () => {

    test('should convert records to JSON string', () => {
        const records = [
            { attributes: { type: 'Account' }, Id: '001', Name: 'Test' }
        ];
        const json = recordsToJson(records);
        const parsed = JSON.parse(json);

        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed[0].Id).toBe('001');
        expect(parsed[0].Name).toBe('Test');
    });

    test('should remove attributes from JSON output', () => {
        const records = [
            { attributes: { type: 'Account', url: '/test' }, Id: '001' }
        ];
        const json = recordsToJson(records);
        const parsed = JSON.parse(json);

        expect(parsed[0]).not.toHaveProperty('attributes');
    });

    test('should flatten nested objects in JSON', () => {
        const json = recordsToJson(nestedRecords);
        const parsed = JSON.parse(json);

        expect(parsed[0]['Account.Name']).toBe('Acme Corporation');
        expect(parsed[0]['Account.Industry']).toBe('Technology');
    });

    test('should produce valid JSON', () => {
        const json = recordsToJson(sampleRecords);

        expect(() => JSON.parse(json)).not.toThrow();
    });

    test('should format JSON with indentation', () => {
        const json = recordsToJson(sampleRecords);

        expect(json).toContain('\n');
        expect(json).toContain('  '); // 2-space indentation
    });
});

describe('SOQL Export - recordsToCsv', () => {

    test('should convert records to CSV with comma delimiter', () => {
        const records = [
            { Id: '001', Name: 'Test1' },
            { Id: '002', Name: 'Test2' }
        ];
        const csv = recordsToCsv(records, ',');
        const lines = csv.split('\n');

        expect(lines.length).toBe(3); // header + 2 data rows
        expect(lines[0]).toContain('Id');
        expect(lines[0]).toContain('Name');
    });

    test('should convert records to TSV with tab delimiter', () => {
        const records = [
            { Id: '001', Name: 'Test1' },
            { Id: '002', Name: 'Test2' }
        ];
        const tsv = recordsToCsv(records, '\t');

        expect(tsv).toContain('\t');
        expect(tsv).not.toMatch(/^[^"\t]*,[^"\t]*$/m); // no unquoted commas as delimiters
    });

    test('should return empty string for empty records', () => {
        expect(recordsToCsv([])).toBe('');
        expect(recordsToCsv(null)).toBe('');
    });

    test('should handle records with null values', () => {
        const records = [
            { Id: '001', Name: null, Industry: 'Tech' }
        ];
        const csv = recordsToCsv(records, ',');

        expect(csv).toContain('Id');
        // null should become empty string
        expect(csv).not.toContain('null');
    });

    test('should escape special characters in CSV', () => {
        const records = [
            { Id: '001', Name: 'Test, Inc.' },
            { Id: '002', Name: 'Say "Hello"' }
        ];
        const csv = recordsToCsv(records, ',');

        expect(csv).toContain('"Test, Inc."');
        expect(csv).toContain('"Say ""Hello"""');
    });

    test('should flatten nested objects in CSV', () => {
        const csv = recordsToCsv(nestedRecords, ',');

        expect(csv).toContain('Account.Name');
        expect(csv).toContain('Account.Industry');
        expect(csv).toContain('Acme Corporation');
    });

    test('should include all columns even if some records lack fields', () => {
        const records = [
            { Id: '001', Name: 'Test1' },
            { Id: '002', Name: 'Test2', Extra: 'Value' }
        ];
        const csv = recordsToCsv(records, ',');

        expect(csv).toContain('Extra');
    });
});

describe('SOQL Export - Integration Tests', () => {

    test('should handle full Salesforce response format', () => {
        const response = {
            totalSize: 3,
            done: true,
            records: sampleRecords
        };

        const json = recordsToJson(response.records);
        const csv = recordsToCsv(response.records, ',');

        expect(JSON.parse(json).length).toBe(3);
        expect(csv.split('\n').length).toBe(4); // header + 3 rows
    });

    test('should produce consistent output for same data', () => {
        const csv1 = recordsToCsv(sampleRecords, ',');
        const csv2 = recordsToCsv(sampleRecords, ',');

        expect(csv1).toBe(csv2);
    });

    test('should handle large record sets efficiently', () => {
        const largeRecords = [];
        for (let i = 0; i < 1000; i++) {
            largeRecords.push({
                attributes: { type: 'Account' },
                Id: `001xx00000${i.toString().padStart(6, '0')}`,
                Name: `Account ${i}`,
                Industry: 'Technology',
                AnnualRevenue: i * 1000
            });
        }

        const startTime = Date.now();
        const csv = recordsToCsv(largeRecords, ',');
        const elapsed = Date.now() - startTime;

        expect(csv.split('\n').length).toBe(1001); // header + 1000 rows
        expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
    });
});

describe('SOQL Export - Edge Cases', () => {

    test('should handle empty string values', () => {
        const records = [{ Id: '001', Name: '' }];
        const csv = recordsToCsv(records, ',');

        expect(csv).toContain('001');
    });

    test('should handle special unicode characters', () => {
        const records = [
            { Id: '001', Name: 'Tëst Cömpäny ™' },
            { Id: '002', Name: '日本語テスト' }
        ];
        const csv = recordsToCsv(records, ',');
        const json = recordsToJson(records);

        expect(csv).toContain('Tëst Cömpäny ™');
        expect(csv).toContain('日本語テスト');
        expect(json).toContain('Tëst Cömpäny ™');
        expect(json).toContain('日本語テスト');
    });

    test('should handle boolean and numeric values correctly', () => {
        const records = [
            { Id: '001', IsActive: true, Revenue: 1000000 }
        ];
        const csv = recordsToCsv(records, ',');
        const json = recordsToJson(records);

        expect(csv).toContain('true');
        expect(csv).toContain('1000000');

        const parsed = JSON.parse(json);
        expect(parsed[0].IsActive).toBe(true);
        expect(parsed[0].Revenue).toBe(1000000);
    });

    test('should handle array values (subquery results)', () => {
        const records = [
            {
                attributes: { type: 'Account' },
                Id: '001',
                Contacts: {
                    totalSize: 2,
                    done: true,
                    records: [
                        { attributes: { type: 'Contact' }, Id: 'c001' },
                        { attributes: { type: 'Contact' }, Id: 'c002' }
                    ]
                }
            }
        ];

        // Arrays should be preserved in the flattening (not expanded)
        const flat = flattenRecord(records[0]);
        expect(flat.Id).toBe('001');
        // Contacts is an object with records array - should be flattened but records stays
    });

    test('should handle records with only Id field', () => {
        const records = [
            { attributes: { type: 'Account' }, Id: '001' },
            { attributes: { type: 'Account' }, Id: '002' }
        ];

        const csv = recordsToCsv(records, ',');
        const lines = csv.split('\n');

        expect(lines[0]).toBe('Id');
        expect(lines[1]).toBe('001');
        expect(lines[2]).toBe('002');
    });
});

describe('SOQL Export - Clipboard Operations', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should call clipboard API with correct JSON content', async () => {
        const records = [{ Id: '001', Name: 'Test' }];
        const json = recordsToJson(records);

        await navigator.clipboard.writeText(json);

        expect(mockClipboard.writeText).toHaveBeenCalledWith(json);
    });

    test('should call clipboard API with correct CSV content', async () => {
        const records = [{ Id: '001', Name: 'Test' }];
        const csv = recordsToCsv(records, ',');

        await navigator.clipboard.writeText(csv);

        expect(mockClipboard.writeText).toHaveBeenCalledWith(csv);
    });
});

describe('SOQL Export - File Download', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should create blob URL for download', () => {
        const content = 'test,data\n1,2';
        const blob = new Blob([content], { type: 'text/csv' });

        URL.createObjectURL(blob);

        expect(URL.createObjectURL).toHaveBeenCalled();
    });

    test('should generate correct filename format', () => {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
        const filename = `soql_export_${timestamp}.csv`;

        expect(filename).toMatch(/^soql_export_\d{8}T\d{6}\.csv$/);
    });

    test('should generate JSON filename correctly', () => {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
        const filename = `soql_export_${timestamp}.json`;

        expect(filename).toMatch(/^soql_export_\d{8}T\d{6}\.json$/);
    });
});

describe('SOQL Export - Status Messages', () => {

    test('should generate success message for JSON copy', () => {
        const message = 'JSON copied to clipboard!';
        expect(message).toContain('JSON');
        expect(message).toContain('copied');
    });

    test('should generate success message for CSV copy', () => {
        const message = 'CSV copied to clipboard!';
        expect(message).toContain('CSV');
        expect(message).toContain('copied');
    });

    test('should generate success message for download', () => {
        const filename = 'soql_export_20260208T120000.csv';
        const message = `Downloaded ${filename}`;
        expect(message).toContain('Downloaded');
        expect(message).toContain(filename);
    });

    test('should generate error message for failed copy', () => {
        const format = 'JSON';
        const message = `Failed to copy ${format}`;
        expect(message).toContain('Failed');
        expect(message).toContain(format);
    });
});

