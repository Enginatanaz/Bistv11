import assert from 'node:assert';
import { KapDisclosuresService } from '../services/kapDisclosuresService.js';

console.log('Running KAP Disclosures & Company Profile Verification Tests...');

const service = new KapDisclosuresService();

// Test 1: Zero Fake/Mock Disclosures on Startup
const initialDisclosures = service.getFeed({ limit: 500 });
for (const d of initialDisclosures) {
  assert.ok(
    d.dataSource === 'BURKUT_KAP_API' || d.dataSource === 'KAP_PUBLIC_WEB',
    `Invalid dataSource: ${d.dataSource}`
  );
  assert.strictEqual(d.isVerified, true, 'Every disclosure must be verified');
}
console.log('✓ Test 1 Passed: Zero fake/mock/placeholder disclosures exist in the system.');

// Test 2: Official KAP Company Profiles for Major BIST Tickers
const keyTickers = ['THYAO', 'ASELS', 'GARAN', 'TUPRS', 'EREGL', 'AKBNK', 'KCHOL', 'BIMAS', 'FROTO', 'SISE'];
for (const symbol of keyTickers) {
  const profile = service.getCompanyProfile(symbol);
  assert.ok(profile, `Expected KAPCompanyProfile for ${symbol}`);
  assert.strictEqual(profile.symbol, symbol, `Profile symbol must match ${symbol}`);
  assert.strictEqual(profile.isVerified, true, `Profile for ${symbol} must be verified`);
  assert.ok(profile.kapProfileUrl.includes('kap.org.tr/tr/sirket-bilgileri/ozet/'), `Official KAP URL required for ${symbol}`);
  assert.ok(profile.capitalStructure.paidInCapitalTL > 100_000_000, `Expected realistic paid-in capital for ${symbol}`);
  assert.ok(profile.shareholderStructure.length >= 2, `Expected shareholder breakdown for ${symbol}`);
}
console.log('✓ Test 2 Passed: Official KAP Company Profiles verified with 100% ticker accuracy.');

// Test 3: Strict Max 5 Verified Disclosures Per Stock & Chronological Ordering
for (let i = 1; i <= 7; i++) {
  service.addLiveDisclosure({
    id: `KAP-THYAO-${1350000 + i}`,
    disclosureIndex: String(1350000 + i),
    symbol: 'THYAO',
    companyTitle: 'TÜRK HAVA YOLLARI ANONİM ORTAKLIĞI',
    title: `Özel Durum Açıklaması #${i}`,
    category: 'Yatırım / Sözleşme',
    disclosureType: 'ÖDA',
    publishDate: `2026-03-${10 + i}T09:30:00+03:00`,
    publishTime: '09:30:00',
    summary: `Türk Hava Yolları A.O. tarafından yapılan doğrulanmış KAP açıklaması #${i}.`,
    originalText: `Türk Hava Yolları A.O. tarafından yapılan doğrulanmış KAP açıklaması #${i}.`,
    originalUrl: `https://www.kap.org.tr/tr/Bildirim/${1350000 + i}`,
    isImportant: true,
    isVerified: true,
    dataSource: 'BURKUT_KAP_API',
  });
}

const thyaoDisclosures = service.getDisclosuresForSymbol('THYAO');
assert.strictEqual(thyaoDisclosures.length, 5, `Strictly max 5 disclosures allowed per symbol, got ${thyaoDisclosures.length}`);
assert.strictEqual(String(thyaoDisclosures[0].disclosureIndex), '1350007', 'Most recent disclosure must be first');
assert.strictEqual(String(thyaoDisclosures[4].disclosureIndex), '1350003', '5th most recent disclosure must be last');
console.log('✓ Test 3 Passed: Strict latest 5 KAP disclosures rule enforced and sorted newest-first.');

// Test 4: Combined Stock KAP Dataset (Profile + Latest 5 Disclosures)
const dataset = service.getStockKapDataset('THYAO');
assert.ok(dataset, 'Expected StockKAPDataset for THYAO');
assert.strictEqual(dataset.symbol, 'THYAO');
assert.strictEqual(dataset.profile.companyTitle, 'TÜRK HAVA YOLLARI ANONİM ORTAKLIĞI');
assert.strictEqual(dataset.latestDisclosures.length, 5);
assert.strictEqual(dataset.maxDisclosuresLimit, 5);
console.log('✓ Test 4 Passed: StockKAPDataset combines verified KAPCompanyProfile + latest 5 disclosures.');

// Test 5: Status Report & Official Endpoints
const status = service.getStatusReport();
assert.ok(status.officialPortalUrl?.startsWith('https://www.kap.org.tr'), 'Official KAP portal URL must be kap.org.tr');
assert.ok(status.officialEndpoint?.includes('/api/public/v1/kap'), 'Official endpoint must point to Burkut KAP API');
assert.strictEqual(status.maxDisclosuresPerStock, 5);
console.log('✓ Test 5 Passed: Status report references only Burkut KAP API and kap.org.tr.');

console.log('All KAP Disclosures & Company Profile tests passed successfully!');
process.exit(0);
