const axios = require('axios');

class FileService {
    constructor() {
        this.baseUrl = process.env.FILES_SERVICE_URL || 'http://localhost:3005';
        this.apiKey = "Ebz508dwQPfs9gC";
    }

    async uploadFile(fileBuffer, originalName, mimetype) {
        const formData = new FormData();
        formData.append('file', new Blob([fileBuffer], { type: mimetype }), originalName);

        const response = await axios.post(`${this.baseUrl}/upload`, formData, {
            headers: { 'x-api-key': this.apiKey }
        });

        return response.data.data; // Retourne { fileId, originalName, size, etc. }
    }

    async generateTempLink(fileId) {
        const response = await axios.get(`${this.baseUrl}/generate-link/${fileId}`);
        return response.data.data; // Retourne { accessUrl, expiresAt, etc. }
    }

    async deleteFile(fileId) {
        const response = await axios.delete(`${this.baseUrl}/${fileId}`, {
            headers: { 'x-api-key': this.apiKey }
        });
        return response.data.data;
    }
}

module.exports = new FileService();