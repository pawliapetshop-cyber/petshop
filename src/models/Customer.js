module.exports = (sequelize, DataTypes) => {
  return sequelize.define("Customer", {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    document: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: false
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true
    },
    address: {
      type: DataTypes.STRING,
      allowNull: true
    },
    totalSpent: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0
    },
    totalOrders: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    followUpStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "none"
    },
    followUpNotes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    lastContactAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    lastOrderAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  });
};
