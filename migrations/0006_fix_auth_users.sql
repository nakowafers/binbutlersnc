-- 1. Add name column to customers so it completely matches NextAuth's User schema
ALTER TABLE customers ADD COLUMN name TEXT;

-- 2. Create the users view that maps exactly to the customers table
CREATE VIEW users AS
SELECT id, name, email, emailVerified, image, role FROM customers;

-- 3. Create triggers to allow NextAuth to insert/update/delete via the users view
CREATE TRIGGER insert_users INSTEAD OF INSERT ON users
BEGIN
  INSERT INTO customers (id, name, email, emailVerified, image, role)
  VALUES (
    NEW.id, 
    NEW.name, 
    NEW.email, 
    NEW.emailVerified, 
    NEW.image, 
    COALESCE(NEW.role, 'CUSTOMER')
  );
END;

CREATE TRIGGER update_users INSTEAD OF UPDATE ON users
BEGIN
  UPDATE customers
  SET 
    name = NEW.name, 
    email = NEW.email, 
    emailVerified = NEW.emailVerified, 
    image = NEW.image, 
    role = COALESCE(NEW.role, role)
  WHERE id = OLD.id;
END;

CREATE TRIGGER delete_users INSTEAD OF DELETE ON users
BEGIN
  DELETE FROM customers WHERE id = OLD.id;
END;
