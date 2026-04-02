module.exports = (sequelize, DataTypes) => {
  const OrderItem = sequelize.define("OrderItem", {
    ProductVariantId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    quantity: DataTypes.INTEGER,
    price: DataTypes.FLOAT,
    productName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    variantName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    productImage: {
      type: DataTypes.STRING,
      allowNull: true
    },
    productSnapshot: {
      type: DataTypes.JSON,
      allowNull: true
    }
  });

  return OrderItem;
};
