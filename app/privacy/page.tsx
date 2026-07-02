export const metadata = {
  title: "Privacy Policy — The Green Room Beauty Bar",
  description: "How The Green Room Beauty Bar collects, uses, and protects information, including its SMS text-message program.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-moss-700">Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted">The Green Room Beauty Bar · Last updated June 26, 2026</p>

      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink">
        <p>
          The Green Room Beauty Bar (&quot;we,&quot; &quot;us,&quot; &quot;our&quot;) operates a salon in Methuen,
          Massachusetts where independent stylists and wellness providers rent chairs and rooms. This Privacy
          Policy explains how we collect, use, and protect information — including for our SMS text-message program.
        </p>

        <section>
          <h2 className="font-display text-xl font-semibold text-moss-700">Information We Collect</h2>
          <p className="mt-2">
            We collect the name, mobile phone number, and email address that our renters provide to us directly
            when they begin renting a chair or room with us.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-moss-700">How We Use Information</h2>
          <p className="mt-2">
            We use this information solely to communicate with our renters about their rental — primarily
            rent-payment reminders and related account notifications. We do not use it for unrelated advertising.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-moss-700">SMS / Text Messaging</h2>
          <p className="mt-2">
            By providing your mobile phone number to The Green Room Beauty Bar, you consent to receive text
            messages from us regarding your rent, including payment reminders and account notifications.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><b>Message frequency:</b> varies; typically 1–2 messages per week around your rent due date.</li>
            <li><b>Message and data rates may apply.</b></li>
            <li><b>Opt out:</b> reply <b>STOP</b> at any time to stop receiving messages.</li>
            <li><b>Help:</b> reply <b>HELP</b>, or contact us using the details below.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-moss-700">How We Share Information</h2>
          <p className="mt-2">
            <b>No mobile information will be shared with third parties or affiliates for marketing or promotional
            purposes.</b> Information shared with subcontractors in support services, such as messaging providers,
            is used only to operate our service and is not shared with any third parties for their own marketing purposes.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-moss-700">Data Security</h2>
          <p className="mt-2">We take reasonable measures to protect your information from unauthorized access.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-moss-700">Contact Us</h2>
          <p className="mt-2">
            The Green Room Beauty Bar<br />
            500 Jackson St., Methuen, MA 01844<br />
            Email: tgrbeautybar@gmail.com<br />
            Phone: (978) 308-9540
          </p>
        </section>
      </div>
    </div>
  );
}
