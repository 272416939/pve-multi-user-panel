function getSiteUrl(req) {
    if (process.env.SITE_URL) {
        return process.env.SITE_URL.replace(/\/+$/, '');
    }
    return `${req.protocol}://${req.get('host')}`;
}

module.exports = getSiteUrl;
