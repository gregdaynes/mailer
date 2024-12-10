!! Getting started
===

Design a module that handles sending email.

When sending an email, it must be placed in a queue, be idempotent, and handle server failure gracefully

The module should be hostable in a fastify based application
It should have an event system for notifying the module to send an email.

Application
- needs to notify entity
- decides email is the right path
- performs call to the module api with data payload
  - to
  - from
  - subject
  - template/message id
  - data (for populating template)

Module
- receives call with payload
- writes payload to outbox queue
- emits an event to inform a processor there is a message to be sent
- processor receives message, gets pending message from queue
- writes record to indicate that message is being prepared
- sends message
- writes record to indicate message has been sent (or failed)
- deletes original message in queue.

Use a mutex lock to prevent messages from being processed multiple times or concurrently

If  a message is "stuck" being prepared - no sent/failed within a given constraint
- then record to indicate the message is being prepared should be removed to allow processor to pick it up again


┌───────────────┐
│               │
│               │
│  Application  │
│               │
│               │
└───────────────┘
        │
        │
        ▼
┌──────────────┐    ┌─────────────┐
│              │    │             │
│              │    │             │
│    Module    │───▶│    Store    │
│              │    │             │
│              │    │             │
└──────────────┘    └─────────────┘
       │                  ▲
       │                  │
       ▼                  │
┌─────────────┐    ┌─────────────┐
│             │    │             │
│             │    │             │
│  Event Bus  │───▶│  Processor  │
│             │    │             │
│             │    │             │
└─────────────┘    └─────────────┘

```sql
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
)
```

---

So far this approach is working out, the system can handle around 10k emails/sec. but the database fills up fast.

There needs to be a solution that removes sent messages, a log table to record the transaction has occurred and response, but drop the message from notifications table.
