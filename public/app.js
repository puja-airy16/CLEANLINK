// upload form
document.addEventListener('DOMContentLoaded', async () => {
  const uploadForm = document.getElementById('uploadForm');
  if(uploadForm){
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const fd = new FormData(form);
      const message = document.getElementById('uploadMessage');
      message.textContent = 'Uploading...';
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if(json.ok){
          message.textContent = 'Uploaded — thank you! Our staff will review and assign an NGO.';
          form.reset();
          setTimeout(()=> message.textContent = '', 4000);
        } else {
          message.textContent = json.message || 'Upload failed';
        }
      } catch (err){
        message.textContent = 'Network error';
      }
    });
  }

  // load NGOs to show on home page
  const ngoList = document.getElementById('ngoList');
  if(ngoList){
    const res = await fetch('/api/ngos');
    const ngos = await res.json();
    if(ngos.length === 0) ngoList.innerHTML = '<li>No NGOs currently registered</li>';
    else ngoList.innerHTML = ngos.map(n => `<li><strong>${n.name}</strong><div class="muted">${n.contact}</div></li>`).join('');
  }
});
