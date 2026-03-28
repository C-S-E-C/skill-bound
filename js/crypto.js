    /**
 * TOTP (Time-based One-Time Password) 纯前端实现
 * 遵循 RFC 6238 标准
 */

// CryptoJS 依赖 - 请在HTML中引入或使用以下CDN
// 如果独立运行需要确保 CryptoJS 可用
// 
class TOTP {
    /**
     * 初始化TOTP实例
     * @param {string} secret - Base32编码的密钥
     * @param {Object} options - 可选配置
     * @param {number} options.period - 有效期（秒），默认30
     * @param {number} options.digits - 验证码位数，默认6
     * @param {string} options.algorithm - 哈希算法（SHA1/SHA256/SHA512），默认SHA1
     */
    constructor(secret, options = {}) {
        if (!secret || typeof secret !== 'string') {
            throw new Error('Secret must be a non-empty string');
        }
        
        this.secret = secret.toUpperCase().replace(/\s/g, '');
        this.period = options.period || 30;
        this.digits = options.digits || 6;
        this.algorithm = (options.algorithm || 'SHA1').toUpperCase();
        
        // 验证算法是否支持
        const supportedAlgorithms = ['SHA1', 'SHA256', 'SHA512'];
        if (!supportedAlgorithms.includes(this.algorithm)) {
            throw new Error(`Algorithm must be one of: ${supportedAlgorithms.join(', ')}`);
        }
        
        // 验证位数
        if (this.digits < 6 || this.digits > 8) {
            throw new Error('Digits must be between 6 and 8');
        }
        
        // 验证周期
        if (this.period < 1 || this.period > 60) {
            throw new Error('Period must be between 1 and 60 seconds');
        }
    }
    
    /**
     * Base32解码为字节数组
     * @private
     */
    _base32Decode(base32) {
        const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        const clean = base32.replace(/=+$/, '');
        
        let bits = 0;
        let value = 0;
        const bytes = [];
        
        for (let i = 0; i < clean.length; i++) {
            const char = clean[i];
            const index = base32Chars.indexOf(char);
            
            if (index === -1) {
                throw new Error(`Invalid Base32 character: ${char}`);
            }
            
            value = (value << 5) | index;
            bits += 5;
            
            if (bits >= 8) {
                bytes.push((value >> (bits - 8)) & 0xFF);
                bits -= 8;
            }
        }
        
        return bytes;
    }
    
    /**
     * 字节数组转WordArray (CryptoJS格式)
     * @private
     */
    _bytesToWordArray(bytes) {
        const words = [];
        for (let i = 0; i < bytes.length; i += 4) {
            words.push(
                ((bytes[i] || 0) << 24) |
                ((bytes[i + 1] || 0) << 16) |
                ((bytes[i + 2] || 0) << 8) |
                ((bytes[i + 3] || 0))
            );
        }
        return CryptoJS.lib.WordArray.create(words, bytes.length);
    }
    
    /**
     * 获取当前时间戳对应的计数器值
     * @param {Date} date - 可选，指定时间，默认当前时间
     * @returns {number} 计数器值（大整数，作为64位整数处理）
     */
    getCounter(date = new Date()) {
        const timestamp = Math.floor(date.getTime() / 1000);
        return Math.floor(timestamp / this.period);
    }
    
    /**
     * 将计数器转换为字节数组（8字节，大端序）
     * @private
     */
    _counterToBytes(counter) {
        const bytes = new Uint8Array(8);
        for (let i = 7; i >= 0; i--) {
            bytes[i] = counter & 0xFF;
            counter = Math.floor(counter / 256);
        }
        return bytes;
    }
    
    /**
     * 生成动态截断（DT）后的OTP值
     * @param {Uint8Array} hmac - HMAC结果（20/32/64字节）
     * @returns {number} 动态截断后的数字
     */
    _dynamicTruncate(hmac) {
        // 取最后4位的低4位作为偏移量
        const offset = hmac[hmac.length - 1] & 0x0F;
        
        // 从offset位置取4个字节，组成31位整数（去掉最高位）
        const binary = ((hmac[offset] & 0x7F) << 24) |
                       ((hmac[offset + 1] & 0xFF) << 16) |
                       ((hmac[offset + 2] & 0xFF) << 8) |
                       (hmac[offset + 3] & 0xFF);
        
        return binary;
    }
    
    /**
     * 生成TOTP验证码
     * @param {Date} date - 可选，指定时间，默认当前时间
     * @returns {string} 格式化的验证码（补零到指定位数）
     */
    generate(date = new Date()) {
        try {
            // 1. 获取计数器
            const counter = this.getCounter(date);
            
            // 2. 转换计数器为8字节数组
            const counterBytes = this._counterToBytes(counter);
            
            // 3. Base32解码密钥
            const keyBytes = this._base32Decode(this.secret);
            const keyWordArray = this._bytesToWordArray(keyBytes);
            
            // 4. 准备消息（计数器作为WordArray）
            const messageWordArray = CryptoJS.lib.WordArray.create(counterBytes);
            
            // 5. 根据算法选择HMAC方法
            let hmac;
            switch (this.algorithm) {
                case 'SHA1':
                    hmac = CryptoJS.HmacSHA1(messageWordArray, keyWordArray);
                    break;
                case 'SHA256':
                    hmac = CryptoJS.HmacSHA256(messageWordArray, keyWordArray);
                    break;
                case 'SHA512':
                    hmac = CryptoJS.HmacSHA512(messageWordArray, keyWordArray);
                    break;
                default:
                    throw new Error(`Unsupported algorithm: ${this.algorithm}`);
            }
            
            // 6. 将HMAC结果转换为字节数组
            const hmacBytes = [];
            const hmacWords = hmac.words;
            const hmacSigBytes = hmac.sigBytes;
            
            for (let i = 0; i < hmacSigBytes; i++) {
                const wordIndex = Math.floor(i / 4);
                const byteIndex = i % 4;
                const byte = (hmacWords[wordIndex] >> (24 - (byteIndex * 8))) & 0xFF;
                hmacBytes.push(byte);
            }
            
            // 7. 动态截断
            const truncatedBinary = this._dynamicTruncate(hmacBytes);
            
            // 8. 取模得到指定位数的验证码
            const otp = truncatedBinary % Math.pow(10, this.digits);
            
            // 9. 补零格式化
            return otp.toString().padStart(this.digits, '0');
            
        } catch (error) {
            console.error('TOTP generation error:', error);
            throw error;
        }
    }
    
    /**
     * 获取验证码剩余有效秒数
     * @param {Date} date - 可选，指定时间，默认当前时间
     * @returns {number} 剩余秒数
     */
    getRemainingSeconds(date = new Date()) {
        const timestamp = Math.floor(date.getTime() / 1000);
        const elapsed = timestamp % this.period;
        return this.period - elapsed;
    }
    
    /**
     * 验证TOTP验证码是否正确
     * @param {string} code - 待验证的验证码
     * @param {Object} options - 验证选项
     * @param {number} options.window - 时间窗口（前后多少个周期），默认1
     * @param {boolean} options.useCurrentOnly - 仅验证当前周期，默认false
     * @returns {Object} 验证结果 { valid: boolean, delta: number, error?: string }
     */
    verify(code, options = {}) {
        const window = options.window !== undefined ? options.window : 1;
        const useCurrentOnly = options.useCurrentOnly || false;
        
        if (!code || typeof code !== 'string') {
            return { valid: false, delta: null, error: 'Invalid code format' };
        }
        
        const cleanCode = code.replace(/\s/g, '');
        if (!/^\d+$/.test(cleanCode) || cleanCode.length !== this.digits) {
            return { valid: false, delta: null, error: `Code must be ${this.digits} digits` };
        }
        
        const currentCounter = this.getCounter();
        const startDelta = useCurrentOnly ? 0 : -window;
        const endDelta = useCurrentOnly ? 0 : window;
        
        for (let delta = startDelta; delta <= endDelta; delta++) {
            const time = new Date(Date.now() + delta * this.period * 1000);
            const generatedCode = this.generate(time);
            
            if (generatedCode === cleanCode) {
                return { valid: true, delta: delta };
            }
        }
        
        return { valid: false, delta: null, error: 'Code does not match' };
    }
    
    /**
     * 获取当前实例的配置信息
     */
    getConfig() {
        return {
            secret: this.secret.substring(0, 4) + '***' + this.secret.substring(this.secret.length - 4),
            period: this.period,
            digits: this.digits,
            algorithm: this.algorithm
        };
    }
}

/**
 * 工具函数：生成随机Base32密钥
 * @param {number} length - 密钥长度（字节数），默认20字节（160位）
 * @returns {string} Base32编码的密钥
 */
function generateRandomBase32Secret(length = 20) {
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const randomBytes = new Uint8Array(length);
    
    // 使用crypto.getRandomValues生成强随机数
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(randomBytes);
    } else {
        // Fallback for Node.js or older environments
        for (let i = 0; i < length; i++) {
            randomBytes[i] = Math.floor(Math.random() * 256);
        }
    }
    
    let secret = '';
    let bits = 0;
    let value = 0;
    
    for (let i = 0; i < randomBytes.length; i++) {
        value = (value << 8) | randomBytes[i];
        bits += 8;
        
        while (bits >= 5) {
            const index = (value >> (bits - 5)) & 0x1F;
            secret += base32Chars[index];
            bits -= 5;
        }
    }
    
    // 处理剩余位
    if (bits > 0) {
        const index = (value << (5 - bits)) & 0x1F;
        secret += base32Chars[index];
    }
    
    // 添加填充使其长度为8的倍数
    const padding = (8 - (secret.length % 8)) % 8;
    secret += '='.repeat(padding);
    
    return secret;
}


// 导出模块（支持CommonJS、AMD和浏览器全局变量）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TOTP, generateRandomBase32Secret };
} else if (typeof define === 'function' && define.amd) {
    define([], function() {
        return { TOTP, generateRandomBase32Secret };
    });
} else {
    window.TOTP = TOTP;
    window.generateRandomBase32Secret = generateRandomBase32Secret;
}

/* ==================== 使用示例 ==================== */

// 示例1: 基本使用
// const secret = 'JBSWY3DPEHPK3PXP'; // 示例密钥
// const totp = new TOTP(secret, { period: 30, digits: 6, algorithm: 'SHA1' });

// // 生成当前验证码
// console.log('当前验证码:', totp.generate());
// console.log('剩余秒数:', totp.getRemainingSeconds());

// // 验证验证码
// const code = totp.generate();
// console.log('验证结果:', totp.verify(code));

// // 示例2: 生成随机密钥
// const newSecret = generateRandomBase32Secret(20);
// console.log('新密钥:', newSecret);

// // 示例3: 解析URI
// const uri = 'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&period=30&digits=6&algorithm=SHA1';
// const parsed = parseTOTPURI(uri);
// console.log('解析结果:', parsed);

// // 示例4: 生成URI
// const uriConfig = {
//     secret: newSecret,
//     issuer: 'MyApp',
//     account: 'user@example.com',
//     period: 30,
//     digits: 6,
//     algorithm: 'SHA256'
// };
// const newURI = generateTOTPURI(uriConfig);
// console.log('生成URI:', newURI);

// // 示例5: 高精度验证（允许时间漂移）
// const result = totp.verify(code, { window: 2 }); // 允许前后2个周期
// console.log('容错验证:', result);
class SimpleAES {
    /**
     * 从密码派生密钥
     * @param {string} password - 用户密码
     * @param {Uint8Array} salt - 盐值
     * @returns {Promise<CryptoKey>}
     */
    async _deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        
        // 导入密码作为原始密钥材料
        const baseKey = await crypto.subtle.importKey(
            'raw',
            passwordBuffer,
            'PBKDF2',
            false,
            ['deriveKey']
        );
        
        // 派生AES密钥
        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            baseKey,
            {
                name: 'AES-GCM',
                length: 256
            },
            false,
            ['encrypt', 'decrypt']
        );
    }
    
    /**
     * 加密
     * @param {string} password - 密码
     * @param {string} plaintext - 明文
     * @returns {Promise<string>} base64编码的密文
     */
    async encrypt(password, plaintext) {
        // 生成随机盐和IV
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const key = await this._deriveKey(password, salt);
        
        const encoder = new TextEncoder();
        const plaintextBuffer = encoder.encode(plaintext);
        
        // 加密
        const ciphertext = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            plaintextBuffer
        );
        
        // 组合：盐 + IV + 密文
        const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
        combined.set(salt, 0);
        combined.set(iv, salt.length);
        combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
        
        // 转为base64
        return btoa(String.fromCharCode(...combined));
    }
    
    /**
     * 解密
     * @param {string} password - 密码
     * @param {string} encryptedB64 - base64编码的密文
     * @returns {Promise<string>} 明文
     */
    async decrypt(password, encryptedB64) {
        // 从base64解码
        const binary = atob(encryptedB64);
        const combined = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            combined[i] = binary.charCodeAt(i);
        }
        
        // 分离盐、IV和密文
        const salt = combined.slice(0, 16);
        const iv = combined.slice(16, 28);
        const ciphertext = combined.slice(28);
        
        const key = await this._deriveKey(password, salt);
        
        // 解密
        const plaintext = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            ciphertext
        );
        
        const decoder = new TextDecoder();
        return decoder.decode(plaintext);
    }
}

// (async () => {
//     const aes = new SimpleAES();
    
//     const password = "我的密码123";
//     const plain = "这是要加密的敏感数据";
    
//     // 加密
//     const encrypted = await aes.encrypt(password, plain);
//     console.log("加密结果:", encrypted);
    
//     // 解密
//     const decrypted = await aes.decrypt(password, encrypted);
//     console.log("解密结果:", decrypted);
// })();

/**
 * 依赖库: https://cdn.jsdelivr.net/npm/jsencrypt@3.3.2/bin/jsencrypt.min.js
 */

const RSA_TOOL = {
    // 1. 生成密钥对 (默认1024位，返回对象包含公钥和私钥)
    generateKeyPair: function(keySize = 1024) {
        const jse = new JSEncrypt({ default_key_size: keySize });
        return {
            publicKey: jse.getPublicKey(),
            privateKey: jse.getPrivateKey()
        };
    },

    // 2. 公钥加密 (原文 -> 密文)
    encrypt: function(plainText, publicKey) {
        const encryptor = new JSEncrypt();
        encryptor.setPublicKey(publicKey);
        const result = encryptor.encrypt(plainText);
        if (!result) {
            return null; // 加密失败，可能是因为明文过长或公钥无效
        }
        return result;
    },

    // 3. 私钥解密 (密文 -> 原文)
    decrypt: function(cipherText, privateKey) {
        const decryptor = new JSEncrypt();
        decryptor.setPrivateKey(privateKey);
        const result = decryptor.decrypt(cipherText);
        if (!result) {
            return null; // 解密失败，可能是因为密文无效或私钥无效
        }
        return result;
    }
};

// --- 使用示例 ---

// // 生成
// const keys = RSA_TOOL.generateKeyPair();
// console.log("公钥:", keys.publicKey);
// console.log("私钥:", keys.privateKey);

// // 加密
// const myData = "Hello RSA 123456";
// const encrypted = RSA_TOOL.encrypt(myData, keys.publicKey);
// console.log("密文:", encrypted);

// // 解密
// const decrypted = RSA_TOOL.decrypt(encrypted, keys.privateKey);
// console.log("解密后:", decrypted);
