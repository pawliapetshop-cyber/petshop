module.exports = (sequelize, DataTypes) => {
  return sequelize.define("Coupon", {
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true
    },
    discountType: {
      type: DataTypes.ENUM("percent", "fixed"),
      allowNull: false
    },
    discountValue: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    minimumCartAmount: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0
    },
    usageLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    usageCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  });
};
