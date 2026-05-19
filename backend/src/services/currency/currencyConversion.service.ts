export interface CurrencyRate {
  currency: string;
  rateToInr: number;
  source: string;
  asOf: string;
}

export interface CurrencyConversionResult extends CurrencyRate {
  sourceAmount: number;
  convertedAmount: number;
}

const DEFAULT_FX_AS_OF = '2026-05-18';
const DEFAULT_RATE_SOURCE = 'static_default_rates';

const DEFAULT_RATES_TO_INR: Record<string, number> = {
  INR: 1,
  USD: 96.0061,
  EUR: 111.5573,
  GBP: 128.041,
  AUD: 68.7002,
  CAD: 69.7545,
  AED: 26.1417,
  SGD: 74.9457,
  NZD: 56.5259,
};

export class CurrencyConversionService {
  private readonly ratesToInr: Record<string, number>;
  private readonly rateSource: string;
  private readonly ratesAsOf: string;

  constructor() {
    const envRates = this.parseRates(process.env.FX_RATES_TO_INR);
    this.ratesToInr = { ...DEFAULT_RATES_TO_INR, ...envRates };
    this.rateSource = envRates ? 'env:FX_RATES_TO_INR' : DEFAULT_RATE_SOURCE;
    this.ratesAsOf = process.env.FX_RATES_AS_OF || DEFAULT_FX_AS_OF;
  }

  resolveCurrency(country: string, scrapedCurrency?: string): string {
    if (scrapedCurrency && /^[A-Z]{3}$/.test(scrapedCurrency)) return scrapedCurrency;
    const normalized = country.toLowerCase();
    if (normalized.includes('india')) return 'INR';
    if (normalized.includes('united states') || normalized === 'usa') return 'USD';
    if (normalized.includes('united kingdom')) return 'GBP';
    if (normalized.includes('australia')) return 'AUD';
    if (normalized.includes('canada')) return 'CAD';
    if (normalized.includes('united arab emirates') || normalized.includes('uae')) return 'AED';
    if (normalized.includes('singapore')) return 'SGD';
    if (normalized.includes('new zealand')) return 'NZD';
    if (this.isEuroCountry(normalized)) return 'EUR';
    return 'USD';
  }

  getRateToInr(currency: string): CurrencyRate {
    const normalized = currency.toUpperCase();
    const rate = this.ratesToInr[normalized];
    if (!rate) throw new Error(`Missing INR FX rate for currency ${normalized}`);

    return {
      currency: normalized,
      rateToInr: rate,
      source: this.rateSource,
      asOf: this.ratesAsOf,
    };
  }

  convertToInr(amount: number, currency: string): CurrencyConversionResult {
    const rate = this.getRateToInr(currency);
    return {
      ...rate,
      sourceAmount: this.round(amount),
      convertedAmount: this.round(amount * rate.rateToInr),
    };
  }

  convertFromInr(amount: number, targetCurrency: string): CurrencyConversionResult {
    const rate = this.getRateToInr(targetCurrency);
    return {
      ...rate,
      sourceAmount: this.round(amount),
      convertedAmount: this.round(amount / rate.rateToInr),
    };
  }

  private parseRates(value?: string): Record<string, number> | null {
    if (!value) return null;

    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed)
          .map(([currency, rate]) => [currency.toUpperCase(), Number(rate)] as const)
          .filter(([, rate]) => Number.isFinite(rate) && rate > 0)
      );
    } catch {
      const rates = Object.fromEntries(
        value
          .split(',')
          .map((entry) => entry.split(':').map((part) => part.trim()))
          .filter(([currency, rate]) => currency && Number(rate) > 0)
          .map(([currency, rate]) => [currency.toUpperCase(), Number(rate)])
      );
      return Object.keys(rates).length ? rates : null;
    }
  }

  private isEuroCountry(normalizedCountry: string): boolean {
    return [
      'austria',
      'belgium',
      'finland',
      'france',
      'germany',
      'ireland',
      'italy',
      'netherlands',
      'portugal',
      'spain',
    ].some((country) => normalizedCountry.includes(country));
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

export const currencyConversionService = new CurrencyConversionService();
