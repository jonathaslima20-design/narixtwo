/*
  # Create brand-assets public storage bucket

  Creates a public bucket `brand-assets` intended for storing brand imagery
  (logos, favicons, hero illustrations) referenced by the public site. Files
  uploaded here are world-readable so they can be rendered in <img> tags and
  og:image tags without signing.

  1. Storage
    - Bucket `brand-assets` (public)
  2. Security
    - Public read via bucket flag
    - Only admins (via service role) may write — no anon/authenticated
      insert/update/delete policies are added, effectively locking writes.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
