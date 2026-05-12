// Set up test environment variables before any test runs.
// These are fake-but-format-valid values — never real credentials.
process.env['DATABASE_URL'] = 'postgresql://user:password@localhost:5432/test_db';
process.env['CLAUDE_API_KEY'] = 'sk-ant-test-key-for-unit-tests';
process.env['SENDGRID_API_KEY'] = 'SG.test-key-for-unit-tests';
process.env['RECIPIENT_EMAIL'] = 'test@example.com';
process.env['RESUME_BASE64'] = 'dGVzdA=='; // bypasses RESUME_PATH file existence check
process.env['RESUME_PATH'] = './resume.pdf';
process.env['NODE_ENV'] = 'test';