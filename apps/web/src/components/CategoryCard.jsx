import { useNavigate } from 'react-router-dom';
import './CategoryCard.css';

import { getResolvedImageUrl, PLACEHOLDER } from '../utils/imageUtils';

export default function CategoryCard({ category, storeType }) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/products?categoryId=${category.id}&storeType=${storeType || ''}`);
  };

  const imageUrl = getResolvedImageUrl(category);

  return (
    <div className="category-card" onClick={handleClick}>
      <div className="category-img-wrapper">
        <img
          src={imageUrl}
          alt={category.name}
          className="category-img"
          loading="lazy"
          onError={(e) => { e.target.onerror = null; e.target.src = PLACEHOLDER; }}
        />
      </div>
      <div className="category-name">{category.name}</div>
    </div>
  );
}
