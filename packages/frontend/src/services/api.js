import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

export const getEmails = async (label, sentiment) => {
  const params = {};
  if (label) params.label = label;
  if (sentiment) params.sentiment = sentiment;
  
  const response = await axios.get(`${API_URL}/emails`, { params });
  return response.data;
};

export const replyToEmail = async (emailId, content) => {
  try {
    const response = await axios.post(`${API_URL}/emails/${emailId}/reply`, {
      content
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server error
      throw new Error(error.response.data.error || 'Server error occurred');
    } else if (error.request) {
      // Request error
      throw new Error('Cannot reach the server');
    } else {
      // Other errors
      throw new Error('An error occurred');
    }
  }
};

export const triggerAnalysis = async () => {
  const response = await axios.get(`${API_URL}/trigger-analysis`);
  return response.data;
}; 