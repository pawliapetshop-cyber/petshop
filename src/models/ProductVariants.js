module.exports = (sequelize, DataTypes) => {
  const ProductVariant = sequelize.define("ProductVariant", {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    stock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    reservedStock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    price: {
      type: DataTypes.FLOAT,
      allowNull: true
    }
  });

  return ProductVariant;
};
