-- Seed demo data (applies after core schema)
INSERT INTO teams (name) VALUES ('Demo Team') ON CONFLICT DO NOTHING;

INSERT INTO users (email, display_name)
VALUES ('demo@example.com','Demo User')
ON CONFLICT (email) DO NOTHING;

-- link user to team
INSERT INTO team_members (team_id, user_id, role)
SELECT t.id, u.id, 'owner'
FROM teams t, users u
WHERE t.name = 'Demo Team' AND u.email = 'demo@example.com'
ON CONFLICT DO NOTHING;

-- demo campaign
INSERT INTO campaigns (team_id, name, status, region, language)
SELECT t.id, 'Spring Campaign', 'active', 'RU', 'ru'
FROM teams t WHERE t.name = 'Demo Team'
ON CONFLICT DO NOTHING;




