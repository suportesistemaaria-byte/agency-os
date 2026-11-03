-- Storage em Postgres (adaptador para deploy sem R2): bytes fora das tabelas de negócio, acessados só pelo adaptador.
CREATE TABLE file_blobs (
  storage_key text PRIMARY KEY,
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
