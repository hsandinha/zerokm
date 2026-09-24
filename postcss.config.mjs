// O Tailwind entra só pelo módulo WhatsApp
// (app/dashboard/admin/whatsapp/whatsapp.css). O resto da zerokm é CSS
// Modules e passa por aqui sem ser tocado: o plugin só age em arquivos que
// importam o Tailwind.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
