const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// 确保 images 目录存在（项目根目录下的 images/）
const imagesDir = path.join(__dirname, '../../images');
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, imagesDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
        cb(null, filename);
    }
});

const fileFilter = (req, file, cb) => {
    // 扩展名与 mimetype 分别用各自格式的正则：mimetype 是 image/png 格式，扩展名是 .png 格式。
    // 此前误把 mimetype 正则（image\/xxx）套在 path.extname 的返回（.png）上 → 所有文件被拒 → 头像上传恒 500
    const extnameOk = /\.(jpeg|jpg|png|gif|webp)$/i.test(path.extname(file.originalname).toLowerCase());
    const mimetypeOk = /^image\/(jpeg|jpg|png|gif|webp)$/.test(file.mimetype);

    if (extnameOk && mimetypeOk) {
        return cb(null, true);
    } else {
        // 带 status=400，让全局错误处理器返回 400 而非默认 500（非法图片是客户端输入错误）
        const e = new Error('只允许上传图片文件');
        e.status = 400;
        cb(e);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: fileFilter
});

module.exports = upload;
