module.exports = (sequelize, DataTypes) => {
  return sequelize.define("Product", {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    price: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0
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
    lowStockThreshold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true
    },
    longDescription: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  });
};
