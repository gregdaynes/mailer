import {sql} from '@databases/sqlite-sync'

export default sql`
  CREATE TABLE IF NOT EXISTS 'notifications' (
    id_notification TEXT NOT NULL,
    nonce TEXT NOT NULL,
    sender TEXT NOT NULL,
    sender_name TEXT NULL,
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

  CREATE INDEX IF NOT EXISTS notifications_nonce_index
    ON notifications (nonce);

  CREATE INDEX IF NOT EXISTS notifications_preparing_index
    ON notifications (preparing);

  CREATE INDEX IF NOT EXISTS notifications_prepared_index
    ON notifications (prepared);
`
