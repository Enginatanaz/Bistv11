import assert from 'node:assert';
import { KapDisclosuresService } from '../services/kapDisclosuresService.js';
import { KapBackfillEngine } from '../services/kapBackfillEngine.js';

async function runTests() {
  console.log('Running KAP Backfill Engine & Max-5 Disclosure Tests...\n');

  const kapService = new KapDisclosuresService();
  const backfillEngine = new KapBackfillEngine(kapService);

  // 1. Verify Backfill Status Structure
  console.log('1. Testing Backfill Status Structure...');
  const status = backfillEngine.getStatus();
  assert.strictEqual(status.dataSource, 'BURKUT_KAP_API', 'Backfill dataSource must be BURKUT_KAP_API');
  assert.ok(['IDLE', 'RUNNING', 'COMPLETED', 'PAUSED', 'RATE_LIMITED', 'FAILED', 'ERROR', 'STOPPED'].includes(status.status), 'Valid status required');
  console.log(`   ✓ Initial Status: status=${status.status}, dataSource=${status.dataSource}, covered=${status.stocksWithDisclosuresCount}`);

  // 2. Test Adding Verified Disclosures (Max 5 per Stock Rule) & Deduping
  console.log('2. Testing Live/Backfill Disclosure Ingestion, Max-5 Rule & Deduplication...');
  const initialGaranCount = kapService.getDisclosuresForSymbol('GARAN').length;

  const sampleDisclosure = {
    id: 'BURKUT-TEST-9999991',
    disclosureIndex: '9999991',
    symbol: 'GARAN',
    companyTitle: 'TÜRKİYE GARANTİ BANKASI A.Ş.',
    title: 'Finansal Takvim Bilgilendirmesi',
    category: 'Genel' as const,
    disclosureType: 'DG',
    publishDate: '2026-03-31T10:00:00+03:00',
    publishTime: '10:00:00',
    summary: 'Bankamız 1. çeyrek finansal sonuçları açıklama tarihi belirlenmiştir.',
    originalText: 'Bankamız 1. çeyrek finansal sonuçları açıklama tarihi belirlenmiştir.',
    originalUrl: 'https://www.kap.org.tr/tr/Bildirim/9999991',
    isImportant: false,
    isVerified: true,
    dataSource: 'BURKUT_KAP_API' as const,
  };

  const added1 = kapService.addLiveDisclosure(sampleDisclosure);
  assert.strictEqual(added1, true, 'Should add first new disclosure');
  assert.strictEqual(kapService.getDisclosuresForSymbol('GARAN').length, Math.min(5, initialGaranCount + 1));

  // Add duplicate with same disclosureIndex
  const addedDup = kapService.addLiveDisclosure({ ...sampleDisclosure, id: 'BURKUT-TEST-DUP' });
  assert.strictEqual(addedDup, false, 'Should deduplicate by disclosureIndex');

  // Add 6 more disclosures for GARAN and verify only latest 5 are retained
  for (let i = 2; i <= 7; i++) {
    kapService.addLiveDisclosure({
      ...sampleDisclosure,
      id: `BURKUT-TEST-999999${i}`,
      disclosureIndex: `999999${i}`,
      title: `GARAN Doğrulanmış KAP Bildirimi #${i}`,
      publishDate: `2026-03-31T1${i}:00:00+03:00`,
      publishTime: `1${i}:00:00`,
      originalUrl: `https://www.kap.org.tr/tr/Bildirim/999999${i}`,
    });
  }

  const garanDisclosures = kapService.getDisclosuresForSymbol('GARAN');
  assert.strictEqual(garanDisclosures.length, 5, `Expected strictly 5 disclosures for GARAN, got ${garanDisclosures.length}`);
  assert.strictEqual(String(garanDisclosures[0].disclosureIndex), '9999997', 'Newest disclosure must be first');
  console.log('   ✓ Deduplication and strict 5-disclosure limit per symbol passed.');

  // 3. Test Audit Report Reflects Coverage
  console.log('3. Testing Audit Report Coverage Calculation...');
  const auditReport = await kapService.generateFullUniverseAuditReport(true);
  const garanItem = auditReport.stocks.find(i => i.symbol === 'GARAN');
  assert.ok(garanItem, 'GARAN should exist in audit report');
  assert.strictEqual(garanItem.totalDisclosures, 5, 'GARAN should have max 5 disclosures');
  assert.strictEqual(garanItem.liveDisclosures, 5, 'GARAN should have 5 live verified disclosures');
  console.log(`   ✓ GARAN Audit Item: total=${garanItem.totalDisclosures}, live=${garanItem.liveDisclosures}`);

  console.log('\nAll KAP Backfill Engine tests passed successfully!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
