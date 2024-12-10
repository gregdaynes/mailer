import {sql} from '@databases/sqlite-sync'

export default sql`
  CREATE TABLE IF NOT EXISTS 'notifications' (
    id_notification TEXT NOT NULL,
    nonce TEXT NOT NULL,
    sender TEXT NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    template TEXT NOT NULL,
    data TEXT NOT NULL,
    id_request TEXT NULL,

    -- prepared notification ready to be sent
    notification TEXT NULL,

    -- timestamps for events and locking
    created TEXT NOT NULL,
    preparing TEXT NULL,
    prepared TEXT NULL,
    sending TEXT NULL,
    sent TEXT NULL,

    -- data from sender
    response TEXT NULL,

    CONSTRAINT notification_pk
      PRIMARY KEY (id_notification)
  );
`
