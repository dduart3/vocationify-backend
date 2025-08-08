async function testApiEndpoint() {
  const sessionId = '1ab058b8-bf8f-44ee-857b-5a77fd54f3f1';
  const apiUrl = `http://localhost:3001/api/conversations/sessions/${sessionId}/results`;
  
  try {
    console.log('🚀 Testing API endpoint:', apiUrl);
    const response = await fetch(apiUrl);
    console.log('✅ API Response received');
    console.log('Status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Data:', JSON.stringify(data, null, 2));
    } else {
      const errorText = await response.text();
      console.error('❌ API Error:', response.status, response.statusText);
      console.error('Error body:', errorText);
    }
  } catch (error) {
    console.error('❌ Network error:', error);
  }
}

testApiEndpoint().then(() => {
  console.log('🏁 Test complete');
  process.exit(0);
}).catch(err => {
  console.error('💥 Test failed:', err);
  process.exit(1);
});