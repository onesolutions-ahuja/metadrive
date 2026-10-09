-- 1. Metadata Objects Table (e.g., Account, Contact)
CREATE TABLE IF NOT EXISTS sys_objects (
    id SERIAL PRIMARY KEY,
    api_name VARCHAR(100) UNIQUE NOT NULL,
    label VARCHAR(100) NOT NULL,
    plural_label VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Metadata Fields Table (e.g., Name, Email, Amount)
CREATE TABLE IF NOT EXISTS sys_fields (
    id SERIAL PRIMARY KEY,
    object_id INT REFERENCES sys_objects(id) ON DELETE CASCADE,
    api_name VARCHAR(100) NOT NULL,
    label VARCHAR(100) NOT NULL,
    field_type VARCHAR(50) NOT NULL, -- Text, Number, Date, Lookup, Picklist
    is_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(object_id, api_name)
);

-- 3. Records Table (Stores record instances as JSONB)
CREATE TABLE IF NOT EXISTS sys_records (
    id SERIAL PRIMARY KEY,
    object_api_name VARCHAR(100) REFERENCES sys_objects(api_name) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);