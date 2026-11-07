"""Offline QA for generated synthetic PDFs; no database, network, or credentials.

Requires pdfplumber and Poppler on PATH, or --poppler-dir pointing to its binaries.
Run after: npx tsx scripts/capture-commerce-pdfs.ts
"""
import argparse
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
INPUT = ROOT / '.local/pdf-qa/v4-7'
OUTPUT = ROOT / 'docs/capturas/impresion-v4-7'
EXPECTED = {f'entrega-{count:02}' for count in (1, 5, 10, 15, 25, 35, 50)} | {
    'comprobante-25', 'abono-usdt', 'entrega-anulada-25', 'entrega-a4-25', 'entrega-unicode'}
PUBLIC = {'entrega-01', 'entrega-25', 'entrega-50'}


def require(value, message):
    if not value:
        raise RuntimeError(message)


def money(value):
    return Decimal(value.replace('.', '').replace(',', '.'))


def inspect(sample):
    name = sample['name']
    source = INPUT / (name + '.pdf')
    require(source.is_file() and not source.is_symlink(), f'{name}: not a regular sample')
    require(hashlib.sha256(source.read_bytes()).hexdigest() == sample['sha256'], f'{name}: hash differs')
    extracted = []
    row_numbers, row_totals = [], []
    words_checked, overlaps = 0, []
    with pdfplumber.open(source) as pdf:
        require(len(pdf.pages) == sample['pages'], f'{name}: page count differs')
        for index, page in enumerate(pdf.pages, start=1):
            require(abs(page.width - sample['width']) < .01 and abs(page.height - sample['height']) < .01,
                    f'{name}: paper differs')
            text = page.extract_text(x_tolerance=1, y_tolerance=2) or ''
            extracted.append(text)
            require('MANZANAS MARACAY' in text and 'Folio:' in text and 'DEMO - ENTORNO DE PRUEBAS' in text,
                    f'{name}/{index}: identity missing')
            require(f'Página {index} de {sample["pages"]}' in text, f'{name}/{index}: pagination missing')
            require(index == 1 or 'Continuación' in text, f'{name}/{index}: continuation missing')
            require('ANULADO - NO ENTREGAR' in text if name == 'entrega-anulada-25' else True,
                    f'{name}/{index}: cancellation missing')
            require(not re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202e\ufffd]', text),
                    f'{name}/{index}: unsafe or replacement character')
            for line in text.splitlines():
                match = re.search(r'\bR(\d{3})\b', line)
                if match:
                    row_numbers.append(int(match.group(1)))
                    values = re.findall(r'(?<!\w)(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2,4}(?!\d)', line)
                    require(len(values) >= 2, f'{name}/{index}: numeric cells absent beside row')
                    row_totals.append(money(values[-1]))
            words = page.extract_words(x_tolerance=1, y_tolerance=2)
            require(len(words) > 20, f'{name}/{index}: empty content page')
            words_checked += len(words)
            for word in words:
                # PDF text em boxes can extend slightly beyond the actual glyph ink.
                require(word['x0'] >= 33.9 and word['x1'] <= page.width - 33.9,
                        f'{name}/{index}: horizontal margin: {word["text"]}')
                require(word['top'] >= 32.5 and word['bottom'] <= page.height - 33.9,
                        f'{name}/{index}: vertical margin: {word["text"]}')
            ordered = sorted(words, key=lambda word: word['top'])
            for i, first in enumerate(ordered):
                for second in ordered[i + 1:]:
                    if second['top'] >= first['bottom'] - .1:
                        break
                    x = min(first['x1'], second['x1']) - max(first['x0'], second['x0'])
                    y = min(first['bottom'], second['bottom']) - max(first['top'], second['top'])
                    if x > .2 and y > .2:
                        overlaps.append({'page': index, 'first': first['text'], 'second': second['text']})
        require(not overlaps, f'{name}: overlapping words: {overlaps[:3]}')
    full_text = '\n\f\n'.join(extracted)
    (INPUT / (name + '.txt')).write_text(full_text, encoding='utf-8')
    if name != 'abono-usdt':
        require(row_numbers == list(range(1, sample['expectedRows'] + 1)), f'{name}: missing/repeated/out-of-order rows')
        require(sum(row_totals, Decimal(0)) == Decimal(sample['totalUsd']), f'{name}: subtotal sum differs')
        require('Abonado y saldo ACTUALES al imprimir:' in full_text, f'{name}: current balance not labelled')
        require('Entregado por / firma' in full_text if name.startswith('entrega-') else True,
                f'{name}: signature absent')
    else:
        require('USDT 10,00' in full_text and 'Bs. 1.251,23' in full_text and '30,00' in full_text,
                'Payment snapshot differs')
    if name == 'entrega-unicode':
        require('ÁÉÍÓÚÜÑ áéíóúüñ ¿¡ € £ ¥' in full_text and '[U+1F34E]' in full_text,
                'Unicode representation differs')
        require('<script>alert("literal")</script>' in full_text, 'Literal content was altered')
    return {**sample, 'textExtracted': True, 'actualRowsVerified': name != 'abono-usdt',
            'subtotalSumVerified': name != 'abono-usdt', 'wordBoxesChecked': words_checked,
            'overlappingWordBoxes': len(overlaps), 'physicalPrinterTested': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--poppler-dir', type=Path)
    args = parser.parse_args()
    binary = (args.poppler_dir / ('pdftoppm.exe' if (args.poppler_dir / 'pdftoppm.exe').exists() else 'pdftoppm')) if args.poppler_dir else shutil.which('pdftoppm')
    require(binary is not None, 'Poppler pdftoppm is required')
    manifest = json.loads((INPUT / 'manifest.json').read_text(encoding='utf-8'))
    require(manifest.get('synthetic') is True, 'Only synthetic capture manifests are accepted')
    require({sample['name'] for sample in manifest['samples']} == EXPECTED, 'Unexpected sample set')
    results = [inspect(sample) for sample in manifest['samples']]
    rendered = INPUT / 'rendered'
    rendered.mkdir(exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for sample in results:
        name = sample['name']
        subprocess.run([str(binary), '-r', '110', '-png', str(INPUT / (name + '.pdf')), str(rendered / name)],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        images = sorted(rendered.glob(name + '-*.png'))
        require(len(images) == sample['pages'], f'{name}: rendered page count differs')
        sample['renderedPages'] = len(images)
        if name in PUBLIC:
            for image in images:
                shutil.copyfile(image, OUTPUT / image.name)
    report = {'synthetic': True, 'fixturePrintedAt': manifest['generatedAt'],
              'physicalPrinterTested': False, 'visualReview': 'pending-human-inspection', 'samples': results}
    (OUTPUT / 'verificacion-automatica.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'samples': len(results), 'pagesRendered': sum(result['pages'] for result in results),
                      'textAndWordBoxesVerified': True, 'physicalPrinterTested': False}))


if __name__ == '__main__':
    main()
