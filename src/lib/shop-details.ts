/** Business details transcribed from the client's visiting card. */
export const SHOP_DETAILS = {
  shopName: 'New Al-Aziz Traders',
  tagline: 'Mobile Parts Wholesale Dealer',
  address: 'Shop #67, 2nd Floor, Imperial Market, Liaquat Raja Bazar, Rawalpindi',
  contactName: 'M. Bilal',
  phone: '+92 303 5231061',
  secondaryContactName: 'M. Bashir',
  secondaryPhone: '+92 323 5204621',
  whatsapp: '',
  whatsappUrl: 'https://wa.me/qr/VPVXZCDWG6YTJ1',
};

/** Upgrade only untouched sample details; preserve shop-specific edits. */
export function shopDetailsUpgrade(settings: Record<string, unknown>) {
  if (settings.shopName !== 'Mobile Tools Shop' && settings.shopName !== SHOP_DETAILS.shopName) return {};
  const legacy: Record<string, string> = {
    shopName: 'Mobile Tools Shop', tagline: 'Mobile Repairing Tools & Equipment',
    address: 'Shop #12, Hall Road Plaza, Saddar, Rawalpindi', phone: '0300-0000000',
    whatsapp: '0300-0000000',
  };
  const patch: Record<string, string> = {};
  for (const [key, value] of Object.entries(SHOP_DETAILS)) {
    if (settings[key] === undefined || settings[key] === legacy[key]) patch[key] = value;
  }
  return patch;
}
