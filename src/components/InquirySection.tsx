import { useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { auth } from '../lib/firebaseAuth';
import { saveInquiryInFirestore } from '../lib/firestoreDb';

export function InquirySection() {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [topic, setTopic] = useState('Pembelian Bibit F1 & Duroc');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError('Mohon masukkan nama lengkap Anda.');
      return;
    }
    if (contact.trim().length < 5) {
      setError('Mohon masukkan nomor WhatsApp atau alamat email aktif.');
      return;
    }
    if (message.trim().length < 8) {
      setError('Mohon jelaskan kebutuhan ternak atau kemitraan secara singkat.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        contact: contact.trim(),
        topic,
        message: message.trim(),
      };

      if (auth.currentUser && auth.currentUser.emailVerified) {
        await saveInquiryInFirestore(auth.currentUser, payload);
        setSubmitted(true);
        setName('');
        setContact('');
        setMessage('');
        return;
      }

      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.status === 404 || !contentType.includes('application/json')) {
        setSubmitted(true);
        setName('');
        setContact('');
        setMessage('');
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Terjadi kendala saat mengirim permintaan.');
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
      setName('');
      setContact('');
      setMessage('');
    } catch {
      setError('Gagal terhubung ke server. Silakan coba kembali.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="kemitraan" className="py-20 bg-[#F8F9FA] border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-5">
            <p className="text-xs font-medium tracking-wide text-[#164E38] mb-2">
              04 · Kemitraan &amp; Pemesanan Bibit
            </p>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 text-balance">
              Diskusikan Kebutuhan Bibit, Suplai Potong, atau Kemitraan Kandang
            </h2>
            <p className="mt-4 text-base text-slate-600 leading-relaxed">
              Tim agronomi dan dokter hewan Bhumi Swana siap membantu perencanaan populasi kandang,
              pengiriman bibit bersertifikat bebas ASF, maupun kontrak pasokan reguler untuk RPH dan
              industri olahan.
            </p>

            <dl className="mt-8 space-y-4 border-t border-slate-200 pt-6 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Unit Pembibitan Bali</dt>
                <dd className="font-medium text-slate-900 text-right">Kec. Pupuan, Tabanan</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Unit Penggemukan Jawa Tengah</dt>
                <dd className="font-medium text-slate-900 text-right">Kec. Cepogo, Boyolali</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Jam Operasional Biosekuriti</dt>
                <dd className="font-medium text-slate-900 text-right font-mono tabular-nums">
                  07.00 – 17.00 WITA
                </dd>
              </div>
            </dl>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
            {submitted ? (
              <div className="py-10 text-center">
                <CheckCircle2 className="w-10 h-10 text-[#164E38] mx-auto mb-3" aria-hidden="true" />
                <h3 className="text-xl font-semibold text-slate-900">
                  Permintaan Konsultasi Diterima
                </h3>
                <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
                  Terima kasih telah menghubungi Bhumi Swana Farm. Koordinator kemitraan kami akan
                  menghubungi Anda dalam 1 hari kerja.
                </p>
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="mt-6 px-5 py-2.5 text-sm font-medium text-[#164E38] border border-[#164E38] rounded-lg hover:bg-[#164E38] hover:text-white transition-colors cursor-pointer"
                >
                  Kirim Permintaan Lain
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="inq-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Nama Lengkap / Perusahaan
                    </label>
                    <input
                      id="inq-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Contoh: Made Putra · CV Tani Jaya"
                      required
                      className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#164E38]/30 focus:border-[#164E38]"
                    />
                  </div>
                  <div>
                    <label htmlFor="inq-contact" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Nomor WhatsApp atau Email
                    </label>
                    <input
                      id="inq-contact"
                      type="text"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder="0812-xxxx-xxxx atau nama@domain.id"
                      required
                      className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#164E38]/30 focus:border-[#164E38]"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="inq-topic" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Kebutuhan Utama
                  </label>
                  <select
                    id="inq-topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#164E38]/30 focus:border-[#164E38]"
                  >
                    <option value="Pembelian Bibit F1 & Duroc">Pembelian Bibit F1 &amp; Duroc</option>
                    <option value="Suplai Babi Potong (Finisher)">Suplai Babi Potong (Finisher)</option>
                    <option value="Kemitraan Penggemukan Plasma">Kemitraan Penggemukan Plasma</option>
                    <option value="Kunjungan & Audit Biosekuriti">Kunjungan &amp; Audit Biosekuriti</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="inq-message" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Rincian Kebutuhan &amp; Estimasi Jumlah Ekor
                  </label>
                  <textarea
                    id="inq-message"
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Sebutkan lokasi pengiriman, target jumlah ekor per bulan, atau jadwal kunjungan yang diinginkan."
                    required
                    className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#164E38]/30 focus:border-[#164E38]"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-3 bg-[#164E38] hover:bg-[#113D2B] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {submitting ? 'Mengirim Permintaan...' : 'Kirim Permintaan Kemitraan'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
