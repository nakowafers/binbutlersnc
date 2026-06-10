ALTER TABLE addresses ADD COLUMN scent_preference TEXT NOT NULL DEFAULT 'lavender' CHECK(scent_preference IN ('lavender', 'ocean_breeze', 'tropical'));
