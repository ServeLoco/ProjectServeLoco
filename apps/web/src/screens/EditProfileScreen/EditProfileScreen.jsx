import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { authApi } from '../../api/authApi';
import Button from '../../components/Button';
import './EditProfileScreen.css';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
  </svg>
);

export default function EditProfileScreen() {
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const updateUser = useAuthStore(state => state.updateUser);

  const [formData, setFormData] = useState({
    name: user?.name || '',
    whatsapp: user?.whatsapp ?? user?.whatsapp_number ?? '',
    address: user?.address || '',
  });

  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrors(prev => ({ ...prev, [e.target.name]: null, form: null }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Full name is required';
    if (formData.whatsapp && !/^[0-9]{10}$/.test(formData.whatsapp)) {
      newErrors.whatsapp = 'WhatsApp must be a 10-digit number';
    }
    if (!formData.address.trim()) newErrors.address = 'Delivery address is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    
    setIsSaving(true);
    try {
      const response = await authApi.updateProfile({
        name: formData.name,
        whatsapp: formData.whatsapp,
        address: formData.address,
      });
      
      const serverUser = response?.data?.user || response?.user || response?.data?.profile;
      const updatedProfile = serverUser
        ? { ...serverUser, whatsapp: serverUser.whatsapp ?? serverUser.whatsapp_number ?? formData.whatsapp }
        : { ...user, ...formData };
      updateUser(updatedProfile);
      setSuccess(true);
      
      setTimeout(() => {
        navigate(-1);
      }, 1000);
    } catch (err) {
      setErrors({ form: err.message || 'Failed to update profile' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="screen-container edit-profile-screen">
      <div className="ep-header">
        <button className="ep-back-btn" onClick={() => navigate(-1)}><BackIcon /></button>
        <div className="ep-title">Edit Profile</div>
      </div>

      <div className="ep-content">
        <div className="ep-form">
          <div className="ep-input-group">
            <label className="ep-label">Full Name</label>
            <input 
              type="text" 
              name="name"
              className="ep-input" 
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. John Doe"
            />
            {errors.name && <span className="ep-error">{errors.name}</span>}
          </div>

          <div className="ep-input-group">
            <label className="ep-label">WhatsApp Number (Optional)</label>
            <input 
              type="tel" 
              name="whatsapp"
              className="ep-input" 
              value={formData.whatsapp}
              onChange={handleChange}
              placeholder="e.g. 9876543210"
              maxLength={10}
            />
            {errors.whatsapp && <span className="ep-error">{errors.whatsapp}</span>}
          </div>

          <div className="ep-input-group">
            <label className="ep-label">Delivery Address</label>
            <textarea 
              name="address"
              className="ep-input ep-textarea" 
              value={formData.address}
              onChange={handleChange}
              placeholder="House No, Building, Street, Area"
            />
            {errors.address && <span className="ep-error">{errors.address}</span>}
          </div>

          {errors.form && <div className="ep-error text-center" style={{marginTop: '8px'}}>{errors.form}</div>}
          {success && <div className="ep-success">Profile updated successfully!</div>}
        </div>
      </div>

      <div className="ep-bottom-bar">
        <Button 
          variant={success ? "success" : "primary"}
          onClick={handleSave} 
          disabled={isSaving || success}
        >
          {isSaving ? 'Saving...' : success ? 'Saved!' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
