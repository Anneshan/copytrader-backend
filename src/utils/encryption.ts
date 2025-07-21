import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a1b2c3d4e5f678901234567890abcdef';
const ALGORITHM = 'aes-256-gcm';

if (ENCRYPTION_KEY.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be exactly 32 characters long');
}

console.log('ENCRYPTION_KEY value:', ENCRYPTION_KEY, 'length:', ENCRYPTION_KEY.length);

export const encryptApiKey = (text: string): string => {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(ALGORITHM, ENCRYPTION_KEY);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    throw new Error('Encryption failed');
  }
};

export const decryptApiKey = (encryptedText: string): string => {
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipher(ALGORITHM, ENCRYPTION_KEY);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error('Decryption failed');
  }
};

export const hashPassword = (password: string): string => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

export const generateSecureToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};
