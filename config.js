/* Dulce & Banana public configuration. Safe to host on GitHub Pages. */
window.DB_CONFIG = {
  // Supabase project supplied by bakery owner. Never put a secret/service_role key here.
  supabaseUrl: "https://liplhvsthltszvdeqxwz.supabase.co",
  // Safe public/publishable key from the project owner. NOT a service_role or secret key.
  supabaseAnonKey: "sb_publishable_cgSVuFPvcw4UDyBlHFUrHw_IacGaI0I",
  // Public Turnstile site key is delivered by the order endpoint after activation.
  turnstileSiteKey: "",
  paymentMode: "manual-qr", // PayMongo disabled until merchant setup is approved.
  facebookUrl: "https://www.facebook.com/share/19aByiSkb9/"
};
