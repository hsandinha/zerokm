/**
 * Card Validation Utilities
 * ─────────────────────────
 * Luhn algorithm, brand detection by BIN, and MP BIN API lookup.
 * All pure / browser-safe (no Node-only APIs).
 */

export type CardBrand =
    | 'visa'
    | 'mastercard'
    | 'elo'
    | 'amex'
    | 'hipercard'
    | 'discover'
    | 'unknown';

export interface BrandInfo {
    brand: CardBrand;
    label: string;
    /** Regex that matches the number as typed (with spaces) */
    pattern: RegExp;
    /** Expected number of digits */
    length: number[];
    /** CVV length */
    cvvLength: number;
    /** MP payment_method_id used in API calls */
    mpId: string;
}

// ─── BIN → Brand mapping ──────────────────────────────────────────────────────

const BRANDS: BrandInfo[] = [
    {
        brand: 'amex',
        label: 'American Express',
        pattern: /^3[47]/,
        length: [15],
        cvvLength: 4,
        mpId: 'amex',
    },
    {
        brand: 'hipercard',
        label: 'Hipercard',
        pattern: /^(606282|3841)/,
        length: [16, 19],
        cvvLength: 3,
        mpId: 'hipercard',
    },
    {
        brand: 'elo',
        label: 'Elo',
        pattern: /^(4011(78|79)|43(1274|8935)|45(1416|7393|763(1|2))|50(4175|6699|67[0-6][0-9]|677[0-9]|9[0-8][0-9]{2}|99[0-8][0-9]|999[0-9])|627780|63(6297|6368)|650(03([^4])|04([0-9])|05(0|1)|4(0[5-9]|3[0-9]|8[5-9]|9[0-9])|5([0-2][0-9]|3[0-8])|9([2-6][0-9]|7[0-6])|65[0-9]{2}|7(2[0-9]|3[0-1])|(539[0-1]|540[0-8]))(0|1|[2-9])?|6550[0-9]{2})/,
        length: [16],
        cvvLength: 3,
        mpId: 'elo',
    },
    {
        brand: 'mastercard',
        label: 'Mastercard',
        pattern: /^5[1-5]|^2(2[2-9][1-9]|[3-6][0-9]{2}|7[01][0-9]|720)/,
        length: [16],
        cvvLength: 3,
        mpId: 'master',
    },
    {
        brand: 'visa',
        label: 'Visa',
        pattern: /^4/,
        length: [13, 16, 19],
        cvvLength: 3,
        mpId: 'visa',
    },
    {
        brand: 'discover',
        label: 'Discover',
        pattern: /^6(?:011|5[0-9]{2})/,
        length: [16, 19],
        cvvLength: 3,
        mpId: 'discover',
    },
];

/** Detect card brand from the raw number string (digits only). */
export function detectBrand(digits: string): BrandInfo {
    for (const b of BRANDS) {
        if (b.pattern.test(digits)) return b;
    }
    return {
        brand: 'unknown',
        label: 'Cartão',
        pattern: /^/,
        length: [16],
        cvvLength: 3,
        mpId: '',
    };
}

// ─── Luhn algorithm ───────────────────────────────────────────────────────────

/** Returns true if the card number passes the Luhn check. */
export function luhnCheck(digits: string): boolean {
    if (!digits || digits.length < 10) return false;
    let sum = 0;
    let alternate = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let n = parseInt(digits[i], 10);
        if (alternate) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        sum += n;
        alternate = !alternate;
    }
    return sum % 10 === 0;
}

/** Returns true only when the number length matches the brand's requirements AND passes Luhn. */
export function isValidCardNumber(digits: string): boolean {
    const brand = detectBrand(digits);
    if (!brand.length.includes(digits.length)) return false;
    return luhnCheck(digits);
}

// ─── Expiry validation ────────────────────────────────────────────────────────

/** Validates MM/YYYY expiry. Returns true when the card has not yet expired. */
export function isValidExpiry(mmyyyy: string): boolean {
    const digits = mmyyyy.replace(/\D/g, '');
    if (digits.length < 6) return false;
    const month = parseInt(digits.slice(0, 2), 10);
    const year = parseInt(digits.slice(2, 6), 10);
    if (month < 1 || month > 12) return false;
    const now = new Date();
    const expDate = new Date(year, month); // first day of month AFTER expiry
    return expDate > now;
}

// ─── MP BIN API lookup ────────────────────────────────────────────────────────

export interface BinResult {
    paymentMethodId: string;
    paymentTypeId: string;
    brand: CardBrand;
    brandInfo: BrandInfo;
    issuer?: string;
}

/**
 * Looks up the first 6 digits (BIN) against the MP payment methods API.
 * Uses the public key — safe to call from the browser.
 */
export async function lookupBin(bin6: string, publicKey: string): Promise<BinResult | null> {
    if (!bin6 || bin6.length < 6 || !publicKey) return null;
    try {
        const url = `https://api.mercadopago.com/v1/payment_methods/search?public_key=${publicKey}&bin=${bin6}&site_id=MLB&marketplace=NONE`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const results: any[] = data.results ?? [];
        if (results.length === 0) return null;
        const first = results[0];
        const brandInfo = detectBrand(bin6);
        return {
            paymentMethodId: first.id,
            paymentTypeId: first.payment_type_id,
            brand: brandInfo.brand,
            brandInfo,
            issuer: first.issuer?.name,
        };
    } catch {
        return null;
    }
}
