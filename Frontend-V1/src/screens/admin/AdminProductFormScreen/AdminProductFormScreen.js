/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AppScreen, AppHeader, TextInputField, Button } from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { adminImagesApi, adminProductsApi } from '../../../api';
import { normalizeProduct, pickFirst } from '../../../utils';

function getResponseData(response) {
  return response?.product || response?.data?.product || response?.data || response || {};
}

function getImageData(response) {
  return response?.image || response?.data?.image || response?.data || response || {};
}

function getImageId(image) {
  return pickFirst(image?.id, image?._id, image?.imageId, image?.image_id, null);
}

function getImageUrl(image) {
  return pickFirst(image?.url, image?.imageUrl, image?.image_url, image?.uri, null);
}

function buildImageFormData(asset) {
  const uriParts = asset.uri.split('/');
  const fallbackName = uriParts[uriParts.length - 1] || `product-${Date.now()}.jpg`;
  const formData = new FormData();

  formData.append('image', {
    uri: asset.uri,
    type: asset.type || 'image/jpeg',
    name: asset.fileName || fallbackName,
  });

  return formData;
}

export default function AdminProductFormScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  
  const isEditMode = !!route.params?.productId;
  const productId = route.params?.productId;

  const [isLoading, setIsLoading] = useState(isEditMode);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Form State
  const [form, setForm] = useState({
    name: '',
    category: '',
    price: '',
    unit: '',
    description: '',
    isAvailable: true,
    image: null,
    imageId: null,
  });

  const [errors, setErrors] = useState({});
  const [pendingDeleteImageIds, setPendingDeleteImageIds] = useState([]);

  // Animations
  const animHeader = useRef(new Animated.Value(0)).current;
  const animImage = useRef(new Animated.Value(0)).current;
  const animFields = useRef(new Animated.Value(0)).current;
  const animActions = useRef(new Animated.Value(0)).current;
  
  const imgFade = useRef(new Animated.Value(0)).current;
  const errorShakeX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isEditMode) {
      adminProductsApi.getProduct(productId).then(response => {
        const rawProduct = getResponseData(response);
        const data = normalizeProduct(rawProduct);
        setForm({
          name: data.name,
          category: data.category,
          price: data.price.toString(),
          unit: data.unit,
          description: data.description,
          isAvailable: data.available,
          image: data.imageUrl,
          imageId: getImageId(rawProduct?.image || rawProduct),
        });
        setIsLoading(false);
        runStagger();
      }).catch(() => setIsLoading(false));
    } else {
      runStagger();
    }
  }, [isEditMode, productId]);

  useEffect(() => {
    if (form.image) {
      Animated.timing(imgFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }
  }, [form.image, imgFade]);

  const runStagger = () => {
    Animated.stagger(100, [
      Animated.timing(animHeader, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(animImage, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(animFields, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(animActions, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const shakeError = () => {
    Animated.sequence([
      Animated.timing(errorShakeX, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(errorShakeX, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(errorShakeX, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(errorShakeX, { toValue: 0, duration: 50, useNativeDriver: true })
    ]).start();
  };

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const handleImagePick = async () => {
    setErrors(prev => ({ ...prev, image: null, form: null }));

    try {
      const pickerResult = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.9,
      });

      if (pickerResult.didCancel) {
        return;
      }

      if (pickerResult.errorCode) {
        throw new Error(pickerResult.errorMessage || 'Unable to select image.');
      }

      const asset = pickerResult.assets?.[0];

      if (!asset?.uri) {
        throw new Error('Selected image is missing file data.');
      }

      setIsUploading(true);
      const previousImageId = form.imageId;
      const formData = buildImageFormData(asset);
      const response = await adminImagesApi.uploadImage(formData);
      const image = getImageData(response);
      const nextImageUrl = getImageUrl(image);
      const nextImageId = getImageId(image);

      if (!nextImageUrl) {
        throw new Error('Image uploaded, but the server did not return an image URL.');
      }

      if (previousImageId && previousImageId !== nextImageId) {
        setPendingDeleteImageIds(prev => Array.from(new Set([...prev, previousImageId])));
      }

      setForm(prev => ({ ...prev, image: nextImageUrl, imageId: nextImageId }));
      imgFade.setValue(0);
    } catch (error) {
      setErrors(prev => ({
        ...prev,
        image: error.message || 'Unable to upload image.',
      }));
    } finally {
      setIsUploading(false);
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = 'Name is required';
    if (!form.category.trim()) newErrors.category = 'Category is required';
    if (!form.price.trim()) newErrors.price = 'Price is required';
    else if (isNaN(form.price)) newErrors.price = 'Price must be a valid number';
    if (!form.unit.trim()) newErrors.unit = 'Unit/Size is required';

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      shakeError();
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setIsSaving(true);
    setErrors(prev => ({ ...prev, form: null }));

    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      price: Number(form.price),
      unit: form.unit.trim(),
      description: form.description.trim(),
      isAvailable: form.isAvailable,
      available: form.isAvailable,
      imageUrl: form.image,
      imageId: form.imageId,
      image_id: form.imageId,
    };

    try {
      let response;
      if (isEditMode) {
        response = await adminProductsApi.updateProduct(productId, payload);
      } else {
        response = await adminProductsApi.createProduct(payload);
      }

      const savedProduct = getResponseData(response);
      const savedProductId = pickFirst(savedProduct?.id, savedProduct?._id, productId);

      if (form.imageId && savedProductId) {
        await adminProductsApi.attachImage(savedProductId, {
          imageId: form.imageId,
          image_id: form.imageId,
          imageUrl: form.image,
        });
      }

      if (pendingDeleteImageIds.length > 0) {
        await Promise.all(pendingDeleteImageIds.map(id => adminImagesApi.deleteImage(id)));
      }

      setIsSaving(false);
      navigation.goBack();
    } catch (error) {
      setIsSaving(false);
      setErrors(prev => ({ ...prev, form: error.message || 'Unable to save product' }));
    }
  };

  const handleDelete = async () => {
    if (isEditMode) {
      await adminProductsApi.deleteProduct(productId);
    }
    navigation.goBack();
  };

  if (isLoading) {
    return (
      <AppScreen style={styles.container}>
        <AppHeader title="Edit Product" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </AppScreen>
    );
  }

  const slideUp = (anim) => ({
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }]
  });

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader title={isEditMode ? "Edit Product" : "Add Product"} onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <Animated.View style={[styles.section, slideUp(animImage)]}>
            <Text style={styles.sectionTitle}>Product Image</Text>
            
            <TouchableOpacity style={styles.imageUploadBox} onPress={handleImagePick} disabled={isUploading || isSaving}>
              {isUploading ? (
                <View style={styles.uploadingState}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.uploadText}>Uploading...</Text>
                </View>
              ) : form.image ? (
                <Animated.Image source={{ uri: form.image }} style={[styles.previewImage, { opacity: imgFade }]} />
              ) : (
                <View style={styles.emptyImageState}>
                  <Text style={styles.emptyImageIcon}>Image</Text>
                  <Text style={styles.emptyImageText}>Tap to upload image</Text>
                </View>
              )}
            </TouchableOpacity>
            {form.image && !isUploading && (
              <TouchableOpacity onPress={handleImagePick} style={styles.changeImgBtn}>
                <Text style={styles.changeImgText}>Change Image</Text>
              </TouchableOpacity>
            )}
            {errors.image ? (
              <Text style={styles.errorText}>{errors.image}</Text>
            ) : null}
          </Animated.View>

          <Animated.View style={[styles.section, slideUp(animFields), { transform: [{ translateX: Object.keys(errors).length > 0 ? errorShakeX : 0 }, ...slideUp(animFields).transform] }]}>
            <Text style={styles.sectionTitle}>Product Details</Text>
            
            <TextInputField
              label="Product Name"
              placeholder="e.g. Margherita Pizza"
              value={form.name}
              onChangeText={t => updateField('name', t)}
              error={errors.name}
              editable={!isSaving}
              containerStyle={styles.inputGap}
            />

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <TextInputField
                  label="Category"
                  placeholder="e.g. Pizza"
                  value={form.category}
                  onChangeText={t => updateField('category', t)}
                  error={errors.category}
                  editable={!isSaving}
                  containerStyle={styles.inputGap}
                />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <TextInputField
                  label="Price (Rs.)"
                  placeholder="e.g. 250"
                  value={form.price}
                  onChangeText={t => updateField('price', t)}
                  keyboardType="numeric"
                  error={errors.price}
                  editable={!isSaving}
                  containerStyle={styles.inputGap}
                />
              </View>
            </View>

            <TextInputField
              label="Unit / Size"
              placeholder="e.g. 1 Plate, Regular, 500ml"
              value={form.unit}
              onChangeText={t => updateField('unit', t)}
              error={errors.unit}
              editable={!isSaving}
              containerStyle={styles.inputGap}
            />

            <TextInputField
              label="Description (Optional)"
              placeholder="Brief details about the product..."
              value={form.description}
              onChangeText={t => updateField('description', t)}
              multiline
              numberOfLines={3}
              editable={!isSaving}
              containerStyle={styles.inputGap}
              style={styles.textArea}
            />

            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchLabelTitle}>Availability</Text>
                <Text style={styles.switchLabelSub}>Show to customers</Text>
              </View>
              <Switch
                value={form.isAvailable}
                onValueChange={v => updateField('isAvailable', v)}
                trackColor={{ false: colors.border, true: colors.success + '80' }}
                thumbColor={form.isAvailable ? colors.success : colors.textTertiary}
                disabled={isSaving}
              />
            </View>

          </Animated.View>

          <Animated.View style={[styles.section, styles.actionsSection, slideUp(animActions)]}>
            {errors.form ? (
              <Text style={styles.formErrorText}>{errors.form}</Text>
            ) : null}
            <Button 
              label={isSaving ? "Saving..." : "Save Product"}
              loading={isSaving}
              onPress={handleSave} 
              disabled={isSaving || isUploading}
              style={styles.primaryBtn}
            />
            
            <View style={styles.secondaryActions}>
              {isEditMode && (
                <Button 
                  label="Delete" 
                  variant="outline" 
                  onPress={handleDelete} 
                  disabled={isSaving}
                  style={[styles.halfBtn, styles.deleteBtn]}
                  labelStyle={styles.deleteBtnText}
                />
              )}
              <Button 
                label="Cancel" 
                variant="ghost" 
                onPress={() => navigation.goBack()} 
                disabled={isSaving}
                style={[styles.halfBtn, !isEditMode && { flex: 1 }]}
              />
            </View>
          </Animated.View>

        </ScrollView>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  section: {
    backgroundColor: colors.bgSurface,
    padding: spacing.lg,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  imageUploadBox: {
    height: 200,
    backgroundColor: colors.bgApp,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  uploadingState: {
    alignItems: 'center',
  },
  uploadText: {
    ...typography.caption,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  emptyImageState: {
    alignItems: 'center',
  },
  emptyImageIcon: {
    fontSize: 40,
    marginBottom: spacing.xs,
  },
  emptyImageText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  changeImgBtn: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  changeImgText: {
    ...typography.button,
    color: colors.primary,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.sm,
  },
  inputGap: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  switchLabelTitle: {
    ...typography.labelLarge,
    color: colors.textPrimary,
  },
  switchLabelSub: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  actionsSection: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
    padding: 0,
    marginTop: spacing.sm,
  },
  primaryBtn: {
    marginBottom: spacing.md,
  },
  formErrorText: {
    ...typography.body,
    color: colors.error,
    marginBottom: spacing.md,
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  halfBtn: {
    flex: 1,
  },
  deleteBtn: {
    borderColor: colors.error,
  },
  deleteBtnText: {
    color: colors.error,
  },
});
