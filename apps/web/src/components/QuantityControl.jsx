import './QuantityControl.css';

export default function QuantityControl({ quantity, onIncrease, onDecrease }) {
  return (
    <div className="quantity-control" onClick={(e) => e.stopPropagation()}>
      <button className="quantity-btn" onClick={onDecrease}>−</button>
      <span className="quantity-val">{quantity}</span>
      <button className="quantity-btn" onClick={onIncrease}>+</button>
    </div>
  );
}
