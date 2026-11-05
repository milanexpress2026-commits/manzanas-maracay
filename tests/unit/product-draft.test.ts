import { describe, expect, it } from 'vitest';
import {
  caliberSuggestions,
  catalogFamilyFor,
  productReceiptHref,
} from '../../apps/web/src/lib/product-draft';
describe('suggestions do not reinterpret existing product names', () => {
  it('does not silently reorganize the historical Manzana Gala fruit', () => {
    expect(catalogFamilyFor('Manzana Gala')).toBe('other');
    expect(catalogFamilyFor(' Manzana ')).toBe('apple');
    expect(catalogFamilyFor('PERA')).toBe('pear');
    expect(caliberSuggestions.apple).not.toContain('216');
    expect(caliberSuggestions.bulk).toContain('216');
    expect(caliberSuggestions.pear).not.toContain('198');
    expect(caliberSuggestions.kiwi).toBeUndefined();
    expect(caliberSuggestions.grape).toBeUndefined();
  });
  it('keeps the handoff local and prevents product input from injecting return routes', () => {
    const href = productReceiptHref('id&returnTo=https://example.org', true);
    const url = new URL(href, 'https://manzanas.ganamosclub.net');
    expect(url.origin).toBe('https://manzanas.ganamosclub.net');
    expect(url.pathname).toBe('/recepciones');
    expect(url.searchParams.get('producto')).toBe('id&returnTo=https://example.org');
    expect(url.searchParams.getAll('returnTo')).toEqual(['/ventas/nueva']);
  });
});
