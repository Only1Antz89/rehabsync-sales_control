'use client';

import React, { useState } from 'react';
import { Button, Card, Input } from '@/components/ui';

/** Paste-a-CSV importer: expects a header row with name,email[,phone,clinic] in any order. */
export function CsvImport({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function parseCsv(text: string): Array<Record<string, string>> {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const split = (line: string) =>
      (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? [])
        .map((cell) => cell.replace(/,$/, '').trim().replace(/^"|"$/g, '').replace(/""/g, '"'))
        .slice(0, 10);
    const header = split(lines[0]!).map((h) => h.toLowerCase());
    return lines.slice(1).map((line) => {
      const cells = split(line);
      const row: Record<string, string> = {};
      header.forEach((key, i) => {
        row[key] = cells[i] ?? '';
      });
      return row;
    });
  }

  async function runImport() {
    setBusy(true);
    setResult(null);
    try {
      const parsed = parseCsv(csv);
      const rows = parsed.map((r) => ({
        name: r['name'] ?? [r['first_name'], r['last_name']].filter(Boolean).join(' '),
        email: r['email'],
        phone: r['phone'],
        clinicName: r['clinic'] ?? r['clinic_name'] ?? r['company'],
      }));
      if (rows.length === 0) {
        setResult('Nothing to import — need a header row plus data rows.');
        return;
      }
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      const data = (await res.json().catch(() => null)) as { created?: number; skipped?: number; error?: string } | null;
      if (!res.ok) {
        setResult(data?.error ?? 'Import failed.');
        return;
      }
      setResult(`Imported ${data?.created ?? 0}, skipped ${data?.skipped ?? 0} (duplicates/invalid).`);
      setCsv('');
      onImported();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Import CSV
      </Button>
    );
  }

  return (
    <Card title="Import contacts from CSV" description="Header row required — recognised columns: name (or first_name/last_name), email, phone, clinic. Duplicates by email are skipped.">
      <div className="space-y-3">
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          placeholder={'name,email,clinic\nJane Smith,jane@lakeside.example,Lakeside Physio'}
          className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
          style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
        />
        <Input label="Tag imported contacts (comma separated, optional)" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="physio_show_2026" />
        {result && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{result}</p>}
        <div className="flex gap-2">
          <Button onClick={() => void runImport()} loading={busy}>
            Import
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </div>
    </Card>
  );
}
