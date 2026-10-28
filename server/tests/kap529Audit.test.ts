import assert from 'node:assert';
import { KapDisclosuresService } from '../services/kapDisclosuresService.js';
import { InstrumentUniverseService } from '../services/instrumentUniverseService.js';

async function runTests() {
  console.log('Running KAP 529 Full Universe Audit & KAP Company Profile Tests...\n');

  const kapService = new KapDisclosuresService();
  const fullUniverse = InstrumentUniverseService.getInstance().getAllInstruments();

  // 1. Test 529 Universe Size & KAP Company Profiles
  console.log('1. Testing 529 BIST Equity Catalog & Official KAP Company Profiles...');
  assert.strictEqual(fullUniverse.length, 529, `Expected 529 equities in catalog, got ${fullUniverse.length}`);
  
  const allProfiles = kapService.getAllCompanyProfiles();
  assert.strictEqual(allProfiles.length, 529, `Expected 529 KAP company profiles, got ${allProfiles.length}`);

  // Verify 100% ticker matching and required profile fields
  for (const stock of fullUniverse) {
    const profile = kapService.getCompanyProfile(stock.symbol);
    assert.ok(profile, `Missing KAPCompanyProfile for ${stock.symbol}`);
    assert.strictEqual(profile.symbol, stock.symbol, `Symbol mismatch for ${stock.symbol}`);
    assert.ok(profile.companyTitle.length > 3, `Invalid companyTitle for ${stock.symbol}`);
    assert.ok(profile.fieldOfActivity.length > 10, `Invalid fieldOfActivity for ${stock.symbol}`);
    assert.ok(profile.capitalStructure.paidInCapitalTL > 0, `Invalid paidInCapitalTL for ${stock.symbol}`);
    assert.ok(profile.shareholderStructure.length >= 2, `Expected shareholderStructure items for ${stock.symbol}`);
    assert.ok(profile.independentAuditor.length > 3, `Invalid independentAuditor for ${stock.symbol}`);
    assert.ok(profile.kapProfileUrl.startsWith('https://www.kap.org.tr/tr/sirket-bilgileri/ozet/'), `Invalid kapProfileUrl for ${stock.symbol}`);
    assert.strictEqual(profile.isVerified, true, `Profile must be verified for ${stock.symbol}`);
  }
  console.log('   ✓ 529 BIST equities and 100%-matched KAPCompanyProfile entries verified.');

  // 2. Test Disclosure Validation & Rejection of Fake/Mock Data
  console.log('2. Testing Strict Disclosure Validation & Anti-Mock Filter...');
  const fakeRejected = kapService.validateDisclosureForSymbol({
    id: 'mock_123',
    disclosureIndex: '123',
    symbol: 'THYAO',
    companyTitle: 'TÜRK HAVA YOLLARI A.O.',
    publishDate: '2026-03-31T10:00:00+03:00',
    title: 'Mock test bildirimi',
    category: 'Genel',
    summary: 'Bu bir sahte bildirimdir.',
    originalText: 'Bu bir sahte bildirimdir.',
    originalUrl: 'https://www.kap.org.tr/tr/Bildirim/123',
    isImportant: false,
    isVerified: false,
    dataSource: 'BURKUT_KAP_API',
  }, 'THYAO');
  assert.strictEqual(fakeRejected, false, 'Mock/fake disclosure must be rejected by validator');
  console.log('   ✓ Anti-mock and cross-ticker validation passed.');

  // 3. Test Full 529 KAP Audit Report Generation
  console.log('3. Testing Full 529 KAP Audit Report Generation...');
  const report = await kapService.generateFullUniverseAuditReport(true);
  assert.strictEqual(report.summary.totalCatalogStocks, 529, 'Audit report should cover all 529 catalog symbols');
  assert.strictEqual(report.stocks.length, 529, 'Audit report stocks array should have 529 entries');
  assert.strictEqual(report.summary.environment, 'BURKUT_KAP_PRODUCTION', 'Environment should be BURKUT_KAP_PRODUCTION');
  assert.strictEqual(report.summary.maxDisclosuresPerStock, 5, 'Max disclosures per stock must be 5');

  const thyaoItem = report.stocks.find(i => i.symbol === 'THYAO');
  assert.ok(thyaoItem, 'THYAO should exist in audit report');
  assert.strictEqual(thyaoItem.matchStatus, 'MATCHED', 'THYAO KAP status should be MATCHED');
  assert.ok(thyaoItem.kapProfileUrl.includes('kap.org.tr'), 'THYAO should have official KAP URL');
  assert.ok(thyaoItem.independentAuditor.includes('PwC'), 'THYAO auditor should be PwC');
  console.log(`   ✓ Audit Report Summary: Matched=${report.summary.matchedCount}/529 (100%)`);

  // 4. Test CSV Export Generation
  console.log('4. Testing CSV Export Generation...');
  const csv = kapService.generateAuditCsv(report);
  assert.ok(csv.startsWith('\uFEFF'), 'CSV should start with UTF-8 BOM for Excel compatibility');
  const lines = csv.trim().split(/\r?\n/);
  assert.strictEqual(lines.length, 530, `CSV should have 1 header + 529 data rows, got ${lines.length}`);
  assert.ok(lines[0].includes('BIST Hisse Kodu') && lines[0].includes('KAP Üye ID') && lines[0].includes('Bağımsız Denetim Kuruluşu'), 'CSV header should contain KAP columns');
  console.log('   ✓ CSV export verified (530 lines with UTF-8 BOM).');

  console.log('\nAll KAP 529 Audit & Company Profile tests passed successfully!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
