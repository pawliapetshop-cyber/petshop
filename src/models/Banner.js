module.exports = (sequelize, DataTypes) => {
  return sequelize.define("Banner", {
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    subtitle: {
      type: DataTypes.STRING,
      allowNull: true
    },
    image: {
      type: DataTypes.STRING,
      allowNull: false
    },
    buttonLabel: {
      type: DataTypes.STRING,
      allowNull: true
    },
    sortOrder: {
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
