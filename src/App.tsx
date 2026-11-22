import { useMemo, useState } from 'react';
import { ArrowDownRight, Menu, X } from 'lucide-react';
import { FarmImage } from './components/FarmImage';
import { InquirySection } from './components/InquirySection';
import { PopulationWorkspace } from './components/PopulationWorkspace';
import { useRealtimePopulation } from './hooks/useRealtimePopulation';

const HERO_IMAGE = '/src/assets/images/hero_pig_farm_1795327586619.jpg';
const NURSERY_IMAGE = '/src/assets/images/breed_duroc_piglet_1795327587285.jpg';
const FEED_IMAGE = '/src/assets/images/pig_feed_silo_1795327604406.jpg';
const ESTATE_IMAGE = '/src/assets/images/biosecure_pasture_farm_1795327587092.jpg';

const BREED_PROFILES = [
  {
    name: 'Duroc Unggul',
    origin: 'Pejantan Terminal · Pertumbuhan Cepat',
    metrics: 'ADG 860 g/hari · FCR 2.32 · Marbling Daging Tinggi',
    summary:
      'Digunakan sebagai pejantan utama untuk menghasilkan keturunan F1 dengan konversi pakan efisien dan persentase karkas tinggi.',
  },
  {
    name: 'Yorkshire (Large White)',
    origin: 'Indukan Produktif · Daya Adaptasi Tropis',
    metrics: '11.8 Ekor/Litter · Laktasi Stabil · Ketahanan Baik',
    summary:
      'Memiliki insting keibuan kuat dan produksi susu melimpah untuk menjaga bobot sapih seragam di usia 28 hari.',
  },
  {
    name: 'Landrace',
    origin: 'Garis Maternal · Postur Tubuh Panjang',
    metrics: '11.4 Ekor/Litter · Karkas Ramping · Efisiensi Pakan',
    summary:
      'Dipasangkan dengan Yorkshire untuk membentuk induk F1 berfertilitas tinggi sebelum disilangkan dengan pejantan Duroc.',
  },
];

export default function App() {
  const {
    batches,
    events,
    connectionState,
    connectedClients,
    loading,
    errorMessage,
    clearError,
    addBatch,
    updateBatch,
    removeBatch,
    user,
    hasAccessToken,
    authBusy,
    sheetInfo,
    sheetBusy,
    lastSheetSyncAt,
    prefilledSheetId,
    pendingConfirmation,
    confirmBusy,
    cancelConfirmation,
    proceedConfirmation,
    signInGoogle,
    signOutGoogle,
    createNewSheet,
    connectExistingSheet,
    changeActiveTab,
    syncSheetNow,
    disconnectSheet,
  } = useRealtimePopulation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const summary = useMemo(() => {
    let total = 0;
    let breeders = 0;
    let young = 0;
    let finishers = 0;

    for (const item of batches) {
      total += item.count;
      if (item.phase === 'Indukan' || item.phase === 'Pejantan') {
        breeders += item.count;
      } else if (item.phase === 'Anak Babi' || item.phase === 'Sapihan') {
        young += item.count;
      } else {
        finishers += item.count;
      }
    }

    return {
      total,
      breeders,
      young,
      finishers,
      penCount: batches.length,
    };
  }, [batches]);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#F8F9FA] text-[#0F172A]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 h-16 bg-[#F8F9FA]/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line brand wordmark */}
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Bhumi Swana
          </a>

          {/* Zone 2: 4 concise single-line nav links */}
          <nav
            aria-label="Navigasi utama"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            <a
              href="#populasi"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Populasi
            </a>
            <a
              href="#fasilitas"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Fasilitas
            </a>
            <a
              href="#ras"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Ras &amp; Performa
            </a>
            <a
              href="#kemitraan"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Kemitraan
            </a>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => scrollToSection('populasi')}
              className="hidden sm:inline-flex px-4 py-2 text-xs font-medium text-white bg-[#164E38] hover:bg-[#113D2B] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Input Populasi
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka menu'}
              aria-expanded={mobileMenuOpen}
              className="md:hidden h-10 w-10 inline-flex items-center justify-center text-slate-700 border border-slate-300 rounded-lg bg-white"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-slate-200 px-4 py-4 space-y-3">
            <nav className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              <a
                href="#populasi"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 border-b border-slate-100"
              >
                Populasi Real-Time
              </a>
              <a
                href="#fasilitas"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 border-b border-slate-100"
              >
                Fasilitas &amp; Biosekuriti
              </a>
              <a
                href="#ras"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 border-b border-slate-100"
              >
                Ras &amp; Performa
              </a>
              <a
                href="#kemitraan"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2"
              >
                Kemitraan
              </a>
            </nav>
            <button
              type="button"
              onClick={() => scrollToSection('populasi')}
              className="w-full py-2.5 px-4 text-xs font-medium text-white bg-[#164E38] rounded-lg"
            >
              Input Populasi
            </button>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="pt-12 pb-16 lg:pt-16 lg:pb-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
              {/* Left Hero Copy */}
              <div className="lg:col-span-6 flex flex-col justify-center">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-4">
                  <span>Tabanan &amp; Boyolali</span>
                  <span aria-hidden="true">·</span>
                  <span>Biosekuriti Tiga Zona</span>
                  <span aria-hidden="true">·</span>
                  <span>Pemantauan Populasi Langsung</span>
                </div>

                <h1
                  className="font-display font-bold tracking-tight text-slate-900 leading-[1.08] text-balance"
                  style={{ fontSize: 'clamp(2.25rem, 4vw, 3.75rem)' }}
                >
                  Peternakan Babi Modern dengan Pencatatan Populasi Real-Time
                </h1>

                <p className="mt-5 text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                  Bhumi Swana mengelola pembibitan Duroc, Yorkshire, dan Landrace dalam kandang
                  berventilasi terkontrol, lengkap dengan pencatatan jumlah ternak per blok yang
                  dapat diinput dan diperbarui seketika oleh tim lapangan.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-5">
                  <button
                    type="button"
                    onClick={() => scrollToSection('populasi')}
                    className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-medium text-white bg-[#164E38] hover:bg-[#113D2B] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Kelola Populasi Live</span>
                    <ArrowDownRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <a
                    href="#fasilitas"
                    className="text-sm font-medium text-slate-700 hover:text-slate-900 underline underline-offset-4 whitespace-nowrap shrink-0"
                  >
                    Lihat Standar Kandang
                  </a>
                </div>
              </div>

              {/* Right Hero Media */}
              <div className="lg:col-span-6">
                <div className="h-full min-h-[280px] sm:min-h-[360px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                  <FarmImage
                    src={HERO_IMAGE}
                    alt="Interior kandang babi modern Bhumi Swana Farm yang bersih dan terang"
                    className="h-full lg:h-full object-cover"
                    aspectClass="aspect-[16/9] lg:aspect-auto"
                  />
                </div>
              </div>
            </div>

            {/* Full-width 4-column live KPI strip bound to real-time population */}
            <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 border border-slate-200 rounded-xl bg-white divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
              <div className="p-5 sm:p-6">
                <p className="text-xs text-slate-500">Total Populasi Aktif</p>
                <p className="mt-2 text-2xl sm:text-3xl font-semibold font-mono tabular-nums text-slate-900">
                  {summary.total.toLocaleString('id-ID')}{' '}
                  <span className="text-sm font-sans font-normal text-slate-500">ekor</span>
                </p>
                <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                  Tersebar di {summary.penCount} blok kandang
                </p>
              </div>

              <div className="p-5 sm:p-6">
                <p className="text-xs text-slate-500">Indukan &amp; Pejantan</p>
                <p className="mt-2 text-2xl sm:text-3xl font-semibold font-mono tabular-nums text-slate-900">
                  {summary.breeders.toLocaleString('id-ID')}{' '}
                  <span className="text-sm font-sans font-normal text-slate-500">ekor</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">Materi genetik bersertifikat</p>
              </div>

              <div className="p-5 sm:p-6">
                <p className="text-xs text-slate-500">Anak Babi &amp; Sapihan</p>
                <p className="mt-2 text-2xl sm:text-3xl font-semibold font-mono tabular-nums text-slate-900">
                  {summary.young.toLocaleString('id-ID')}{' '}
                  <span className="text-sm font-sans font-normal text-slate-500">ekor</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">Fase nursery &amp; starter</p>
              </div>

              <div className="p-5 sm:p-6">
                <p className="text-xs text-slate-500">Pembesaran &amp; Siap Panen</p>
                <p className="mt-2 text-2xl sm:text-3xl font-semibold font-mono tabular-nums text-slate-900">
                  {summary.finishers.toLocaleString('id-ID')}{' '}
                  <span className="text-sm font-sans font-normal text-slate-500">ekor</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">Fase grower &amp; finisher</p>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Real-Time Population Section */}
        <PopulationWorkspace
          batches={batches}
          events={events}
          connectionState={connectionState}
          connectedClients={connectedClients}
          loading={loading}
          errorMessage={errorMessage}
          onClearError={clearError}
          onAddBatch={addBatch}
          onUpdateBatch={updateBatch}
          onRemoveBatch={removeBatch}
          user={user}
          hasAccessToken={hasAccessToken}
          authBusy={authBusy}
          sheetInfo={sheetInfo}
          sheetBusy={sheetBusy}
          lastSheetSyncAt={lastSheetSyncAt}
          prefilledSheetId={prefilledSheetId}
          pendingConfirmation={pendingConfirmation}
          confirmBusy={confirmBusy}
          onCancelConfirmation={cancelConfirmation}
          onProceedConfirmation={proceedConfirmation}
          onSignInGoogle={signInGoogle}
          onSignOutGoogle={signOutGoogle}
          onCreateNewSheet={createNewSheet}
          onConnectExistingSheet={connectExistingSheet}
          onChangeActiveTab={changeActiveTab}
          onSyncSheetNow={syncSheetNow}
          onDisconnectSheet={disconnectSheet}
        />

        {/* Core Capabilities Bento Grid */}
        <section id="fasilitas" className="py-20 bg-[#F8F9FA] border-t border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-medium tracking-wide text-[#164E38] mb-2">
                02 · Fasilitas &amp; Tata Kelola Kandang
              </p>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 text-balance">
                Dirancang untuk Kesehatan Ternak dan Efisiensi Pakan
              </h2>
              <p className="mt-3 text-base text-slate-600 leading-relaxed">
                Setiap zona produksi dipisahkan secara ketat untuk mencegah transmisi patogen,
                menjaga kenyamanan termal babi, dan mengolah limbah menjadi energi biogas.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Bento Card 1 (span 2) */}
              <article className="md:col-span-2 border border-slate-200 rounded-xl bg-white overflow-hidden flex flex-col">
                <div className="aspect-[16/9] max-h-80 w-full overflow-hidden bg-slate-100">
                  <FarmImage
                    src={FEED_IMAGE}
                    alt="Babi Duroc makan dari tempat pakan otomatis stainless steel"
                    className="h-full object-cover"
                  />
                </div>
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <p className="text-xs text-slate-500 mb-1.5">
                      Nutrisi Presisi · Silo Tertutup
                    </p>
                    <h3 className="text-xl font-semibold text-slate-900">
                      01. Formulasi Pakan Berbasis Fase &amp; Tempat Pakan Otomatis
                    </h3>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-2xl">
                      Ransum jagung giling, bungkil kedelai, dan asam amino esensial diracik sesuai
                      kebutuhan bobot (pre-starter, starter, grower, hingga finisher) guna menekan
                      pakan tercecer dan menjaga konversi pakan tetap rendah.
                    </p>
                  </div>
                </div>
              </article>

              {/* Bento Card 2 (span 1) */}
              <article className="border border-slate-200 rounded-xl bg-white overflow-hidden flex flex-col">
                <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
                  <FarmImage
                    src={NURSERY_IMAGE}
                    alt="Anak babi sehat di kandang nursery dengan lampu penghangat"
                    className="h-full object-cover"
                  />
                </div>
                <div className="p-6 flex-1">
                  <p className="text-xs text-slate-500 mb-1.5">Perawatan Anak Babi</p>
                  <h3 className="text-lg font-semibold text-slate-900">
                    02. Nursery Terkontrol Suhu
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    Kandang beranak dan sapihan dilengkapi pemanas terarah, lantai alas kering,
                    serta pemantauan kolostrum untuk menjaga daya tahan anak babi baru lahir.
                  </p>
                </div>
              </article>

              {/* Bento Card 3 (span 1) */}
              <article className="border border-slate-200 rounded-xl bg-white p-6 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">Protokol Kesehatan</p>
                  <h3 className="text-lg font-semibold text-slate-900">
                    03. Biosekuriti Tiga Zona Ketat
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    Pemisahan zona kotor (transportasi luar), zona transisi (sanitasi petugas &amp;
                    peralatan), serta zona bersih kandang produksi dengan jadwal vaksinasi rutin.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-200 text-xs text-slate-600 space-y-1.5">
                  <div className="flex justify-between">
                    <span>Desinfeksi kendaraan</span>
                    <span className="font-mono font-medium text-slate-900">Wajib 100%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Karantina bibit baru</span>
                    <span className="font-mono font-medium text-slate-900">21 hari</span>
                  </div>
                </div>
              </article>

              {/* Bento Card 4 (span 2) */}
              <article className="md:col-span-2 border border-slate-200 rounded-xl bg-white overflow-hidden grid grid-cols-1 sm:grid-cols-12">
                <div className="sm:col-span-6 aspect-[16/9] sm:aspect-auto h-full bg-slate-100">
                  <FarmImage
                    src={ESTATE_IMAGE}
                    alt="Kompleks peternakan dengan kubah biogas dan lingkungan hijau"
                    className="h-full object-cover"
                  />
                </div>
                <div className="sm:col-span-6 p-6 flex flex-col justify-center">
                  <p className="text-xs text-slate-500 mb-1.5">Keberlanjutan Lingkungan</p>
                  <h3 className="text-xl font-semibold text-slate-900">
                    04. Pengolahan Limbah Biodigester &amp; Pupuk Cair
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    Limbah cair kandang dialirkan ke reaktor biogas tertutup untuk menghasilkan
                    energi listrik pemanas nursery sekaligus mengurangi bau dan emisi amonia ke
                    area sekitar.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Breed Portfolio & Quantitative Proof Section */}
        <section id="ras" className="py-20 bg-white border-t border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end pb-10 border-b border-slate-200">
              <div className="lg:col-span-7">
                <p className="text-xs font-medium tracking-wide text-[#164E38] mb-2">
                  03 · Galur Genetik &amp; Capaian Produksi
                </p>
                <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 text-balance">
                  Performa Terukur dari Induk hingga Siap Panen
                </h2>
              </div>
              <div className="lg:col-span-5 grid grid-cols-3 gap-4 pt-4 lg:pt-0">
                <div>
                  <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
                    2.35
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Rata-rata FCR</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
                    820 g
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Bobot harian / hari</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
                    97.4%
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Hidup sapihan</p>
                </div>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
              {BREED_PROFILES.map((breed) => (
                <div
                  key={breed.name}
                  className="border border-slate-200 rounded-xl p-6 bg-[#F8F9FA] flex flex-col justify-between"
                >
                  <div>
                    <p className="text-xs text-slate-500">{breed.origin}</p>
                    <h3 className="mt-1.5 text-xl font-semibold text-slate-900">{breed.name}</h3>
                    <p className="mt-3 text-sm text-slate-600 leading-relaxed">{breed.summary}</p>
                  </div>
                  <p className="mt-5 pt-4 border-t border-slate-200 text-xs font-mono tabular-nums text-[#164E38] font-medium">
                    {breed.metrics}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Lead Capture / Kemitraan Section */}
        <InquirySection />
      </main>

      {/* Quiet Footer */}
      <footer className="bg-white border-t border-slate-200 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <p className="font-display text-base font-bold text-slate-900">Bhumi Swana Farm</p>
            <p className="mt-1 text-xs text-slate-500">
              Tabanan, Bali · Boyolali, Jawa Tengah · Peternakan Babi Terpadu
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-600">
            <a href="#populasi" className="hover:text-slate-900">
              Populasi
            </a>
            <a href="#fasilitas" className="hover:text-slate-900">
              Fasilitas
            </a>
            <a href="#ras" className="hover:text-slate-900">
              Ras &amp; Performa
            </a>
            <a href="#kemitraan" className="hover:text-slate-900">
              Kemitraan
            </a>
            <span className="text-slate-400">© 2026 Bhumi Swana Farm</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
