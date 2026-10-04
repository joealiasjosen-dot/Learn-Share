CREATE TABLE IF NOT EXISTS users(id serial PRIMARY KEY,email text UNIQUE NOT NULL,name text,pw text NOT NULL,dob date,country text,phone text,photo text,lang text DEFAULT 'English',theme text DEFAULT 'system',otp_hash text,otp_exp timestamptz,api_key_enc text,key_last4 text);
CREATE TABLE IF NOT EXISTS spaces(id text PRIMARY KEY,owner int REFERENCES users,name text NOT NULL,pw text NOT NULL,created timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS sources(id serial PRIMARY KEY,space text REFERENCES spaces ON DELETE CASCADE,name text,raw text,clean text,keep boolean,note text);
CREATE TABLE IF NOT EXISTS outputs(id serial PRIMARY KEY,space text REFERENCES spaces ON DELETE CASCADE,feature text,title text,data jsonb,lang text,created timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS jobs(id serial PRIMARY KEY,space text,status text DEFAULT 'running',output int,error text);
CREATE TABLE IF NOT EXISTS groups(id text PRIMARY KEY,name text NOT NULL,pw text NOT NULL,created timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS members(grp text REFERENCES groups ON DELETE CASCADE,uid int REFERENCES users,joined timestamptz DEFAULT now(),PRIMARY KEY(grp,uid));
CREATE TABLE IF NOT EXISTS messages(id serial PRIMARY KEY,grp text REFERENCES groups ON DELETE CASCADE,uid int,kind text,body text,file_name text,file_type text,file_data bytea,space jsonb,ts timestamptz DEFAULT now());
-- existing database: ALTER TABLE users ADD COLUMN IF NOT EXISTS api_key_enc text, ADD COLUMN IF NOT EXISTS key_last4 text;
