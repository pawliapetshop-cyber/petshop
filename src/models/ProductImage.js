module.exports = (sequelize, DataTypes) => {
  return sequelize.define("ProductImage", {
    image: DataTypes.STRING,
    isMain: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
  });
};