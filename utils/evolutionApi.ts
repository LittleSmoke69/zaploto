const EVOLUTION_BASE_URL = 'https://evolution.m7flow.com.br/'
const API_KEY = 'C137BE1393AC42FD2A1954A2F7BEB'

export const evolutionApi = {
  async createInstance(instanceName: string) {
    const response = await fetch(`${EVOLUTION_BASE_URL}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY
      },
      body: JSON.stringify({
        instanceName,
        token: instanceName,
        qrcode: true
      })
    })
    return response.json()
  },

  async connectInstance(instanceName: string) {
    const response = await fetch(`${EVOLUTION_BASE_URL}/instance/connect/${instanceName}`, {
      method: 'GET',
      headers: { 'apikey': API_KEY }
    })
    return response.json()
  },

  async sendMessage(instanceName: string, phone: string, message: string) {
    const response = await fetch(`${EVOLUTION_BASE_URL}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY
      },
      body: JSON.stringify({
        number: phone,
        text: message
      })
    })
    return response.json()
  }
}
