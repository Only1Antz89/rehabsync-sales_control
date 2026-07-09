import { beforeAll, describe, expect, it } from 'vitest';
import { unsubscribeToken, verifyUnsubscribeToken } from './tokens';
import { renderCampaignEmail, renderMergeTags } from './merge';

beforeAll(() => {
  process.env['REHABSYNC_SALES_UNSUBSCRIBE_SECRET'] = 'test-secret';
});

describe('unsubscribe tokens', () => {
  it('round-trips and is case-insensitive on email', () => {
    const token = unsubscribeToken('Jane@Clinic.example');
    expect(verifyUnsubscribeToken(token)).toBe('jane@clinic.example');
  });

  it('rejects tampered tokens', () => {
    const token = unsubscribeToken('jane@clinic.example');
    const [payload] = token.split('.');
    const forged = `${Buffer.from('attacker@evil.example').toString('base64url')}.${token.split('.')[1]}`;
    expect(verifyUnsubscribeToken(forged)).toBeNull();
    expect(verifyUnsubscribeToken(`${payload}.deadbeef`)).toBeNull();
    expect(verifyUnsubscribeToken('garbage')).toBeNull();
  });
});

describe('merge tags', () => {
  const ctx = {
    name: 'Jane Smith',
    clinicName: 'Lakeside Physio',
    email: 'jane@clinic.example',
    unsubscribeUrl: 'https://salescentre.rehabsync.app/unsubscribe/tok',
  };

  it('renders known tags and blanks unknown ones', () => {
    expect(renderMergeTags('Hi {{first_name}} from {{clinic_name}}{{bogus}}', ctx)).toBe(
      'Hi Jane from Lakeside Physio',
    );
  });

  it('falls back gracefully when fields are missing', () => {
    expect(renderMergeTags('Hi {{name}}', { ...ctx, name: null })).toBe('Hi there');
  });

  it('always includes a working unsubscribe link', () => {
    const withExplicit = renderCampaignEmail(
      { subject: 's', html: '<a href="{{unsubscribe_url}}">stop</a>' },
      ctx,
    );
    expect(withExplicit.html).toContain(ctx.unsubscribeUrl);
    expect(withExplicit.html).not.toContain('Unsubscribe from these emails'); // no double footer

    const withoutExplicit = renderCampaignEmail({ subject: 's', html: '<p>Hello</p>' }, ctx);
    expect(withoutExplicit.html).toContain(ctx.unsubscribeUrl); // footer appended
  });
});
